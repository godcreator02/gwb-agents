import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/**
 * 连到运行中的 ZCode 桌面端：经 Chromium 远程调试端口直接在工作区窗口的页面里执行脚本，调客户端自己的服务。
 * ZCode 没有给外部用的建任务入口，这是能让任务进侧栏的办法；端口要 ZCode 启动时带上 --remote-debugging-port 才有。
 * 依赖的 React 树结构与服务方法名都是 ZCode 内部的，升级后可能要改这里。
 */

const execFileAsync = promisify(execFile)
/** 避开浏览器常用的 9222 与 Node 默认的 9229 */
export const REMOTE_DEBUGGING_PORT = 9339
export const REMOTE_DEBUGGING_ARGUMENT = `--remote-debugging-port=${REMOTE_DEBUGGING_PORT}`
const TARGET_LIST_URL = `http://127.0.0.1:${REMOTE_DEBUGGING_PORT}/json/list`
const RPC_TIMEOUT_MS = 30_000

const FIND_MAIN_PROCESS_SCRIPT =
  '$p = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "ZCode.exe" -and $_.CommandLine -notmatch "--type=|zcode.cjs|windows-helper" }); ' +
  'if ($p.Count -ne 1) { throw "应有一个 ZCode 主进程，实际 $($p.Count) 个：ZCode 桌面端没开，或开了多个实例" }; ' +
  '@{ executablePath = $p[0].ExecutablePath; commandLine = $p[0].CommandLine } | ConvertTo-Json -Compress'

/** ZCode.exe 的启动参数：ZCode 已经开着时，第二个实例把它转给正在运行的那个，窗口切到这个工作区 */
export const OPEN_WORKSPACE_ARGUMENT = '--open-workspace'

/** zcodeTaskService 管任务（侧栏里的一条），zcodeAgentService 管会话背后的代理进程 */
export type DesktopServiceName = 'zcodeTaskService' | 'zcodeAgentService'

/** 窗口当前工作区记在 React 树里组件的 activeWorkspacePath 属性上；几个组件都带着它，值应当一致 */
const READ_ACTIVE_WORKSPACE_PATHS = `(()=>{
  const root=document.getElementById('root');
  const containerKey=Object.keys(root).find(k=>k.startsWith('__reactContainer'));
  const start=root[containerKey], seen=new Set(), queue=[start,start?.stateNode?.current], paths=new Set();
  while(queue.length){const fiber=queue.shift();if(!fiber||seen.has(fiber))continue;seen.add(fiber);
    const value=fiber.memoizedProps?.activeWorkspacePath;if(typeof value==='string')paths.add(value);
    queue.push(fiber.child,fiber.sibling);}
  return [...paths];
})()`

/** 窗口发会话命令用的 clientId 存在它的 localStorage 里；宿主只收这个窗口的 clientId，别的报 fault.command.clientMismatch */
const READ_CONVERSATION_CLIENT_ID = `localStorage.getItem('zcode-v4-client-id:v1')`

function findServiceInRenderer(serviceName: DesktopServiceName): string {
  return `(()=>{
  const root=document.getElementById('root');
  const containerKey=Object.keys(root).find(k=>k.startsWith('__reactContainer'));
  const start=root[containerKey], seen=new Set(), queue=[start,start?.stateNode?.current];
  while(queue.length){const fiber=queue.shift();if(!fiber||seen.has(fiber))continue;seen.add(fiber);
    const service=fiber.memoizedProps?.services?.${serviceName};if(service)return service;
    queue.push(fiber.child,fiber.sibling,fiber.alternate);}
  throw new Error('窗口的 React 树里找不到 services.${serviceName}，ZCode 内部结构可能变了');
})()`
}

export interface DesktopServices {
  call(service: DesktopServiceName, method: string, args: unknown): Promise<unknown>
  /** 窗口当前的工作区目录 */
  readActiveWorkspacePath(): Promise<string>
  /** 窗口发会话命令（zcodeAgentService.sendConversationCommandV4 的信封）用的 clientId */
  readConversationClientId(): Promise<string>
  /** ZCode 主进程的 ZCode.exe 路径 */
  executablePath: string
}

interface OpenConnection extends DesktopServices {
  close(): Promise<void>
}

interface ZCodeMainProcess {
  executablePath: string
  commandLine: string
}

async function findZCodeMainProcess(): Promise<ZCodeMainProcess> {
  let stdout: string
  try {
    ;({ stdout } = await execFileAsync('pwsh', ['-NoProfile', '-Command', FIND_MAIN_PROCESS_SCRIPT], { windowsHide: true }))
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim()
    throw new Error(`找 ZCode 主进程失败：${stderr || (error as Error).message}`)
  }
  const found = JSON.parse(stdout) as Partial<ZCodeMainProcess>
  if (typeof found.executablePath !== 'string' || typeof found.commandLine !== 'string') {
    throw new Error(`找 ZCode 主进程时 pwsh 输出的不是路径与命令行：${stdout}`)
  }
  return { executablePath: found.executablePath, commandLine: found.commandLine }
}

/** 端口归 ZCode 进程所有、随它退出关闭，可能被多个 home 共用；插件只连上它，不开也不关 */
export function requireRemoteDebuggingArgument(mainProcess: ZCodeMainProcess): void {
  if (mainProcess.commandLine.split(/\s+/).includes(REMOTE_DEBUGGING_ARGUMENT)) return
  throw new Error(
    `ZCode 不是带 ${REMOTE_DEBUGGING_ARGUMENT} 启动的，插件连不上它的窗口。关掉 ZCode，用 "${mainProcess.executablePath}" ${REMOTE_DEBUGGING_ARGUMENT} 重开；` +
      '开始菜单与任务栏的快捷方式也加上这个参数，ZCode 自动更新后重启会丢掉它',
  )
}

interface PageTarget {
  type?: string
  url?: string
  webSocketDebuggerUrl?: string
}

/** 工作区窗口载入的是 out/renderer/index.html；登录页、内置浏览器等别的页面不算 */
export function findWorkspaceWindowTarget(targets: PageTarget[]): string {
  const windows = targets.filter((target) => target.type === 'page' && target.url?.includes('/out/renderer/index.html'))
  const webSocketUrl = windows[0]?.webSocketDebuggerUrl
  if (windows.length !== 1 || webSocketUrl === undefined) throw new Error(`应有一个 ZCode 工作区窗口，实际 ${windows.length} 个`)
  return webSocketUrl
}

async function listPageTargets(): Promise<PageTarget[]> {
  try {
    const response = await fetch(TARGET_LIST_URL, { signal: AbortSignal.timeout(3_000) })
    return (await response.json()) as PageTarget[]
  } catch (error) {
    throw new Error(`ZCode 命令行带着 ${REMOTE_DEBUGGING_ARGUMENT}，但 ${TARGET_LIST_URL} 连不上：${(error as Error).message}`)
  }
}

function connectWebSocket(webSocketUrl: string): Promise<{ evaluate(expression: string): Promise<unknown>; close(): void }> {
  const socket = new WebSocket(webSocketUrl)
  let nextRequestId = 0
  const pendingReplies = new Map<number, {
    reply(value: { result?: unknown; error?: unknown }): void
    fail(error: Error): void
  }>()
  const disconnected = (): Error => new Error('ZCode 调试连接已断开；如果是在发送指令，先去 ZCode 侧栏确认有没有发出去再重试')
  const failPending = (error: Error): void => {
    for (const pending of pendingReplies.values()) pending.fail(error)
    pendingReplies.clear()
  }
  socket.onmessage = (event) => {
    const reply = JSON.parse(String(event.data)) as { id: number; result?: unknown; error?: unknown }
    pendingReplies.get(reply.id)?.reply(reply)
    pendingReplies.delete(reply.id)
  }
  const request = (method: string, params: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (socket.readyState !== 1) { reject(disconnected()); return }
      const id = ++nextRequestId
      const timer = setTimeout(() => {
        pendingReplies.delete(id)
        reject(new Error(`调试协议请求 ${method} ${RPC_TIMEOUT_MS / 1000} 秒无响应；如果是在发送指令，先去 ZCode 侧栏确认有没有发出去再重试`))
      }, RPC_TIMEOUT_MS)
      pendingReplies.set(id, {
        reply: (reply) => {
          clearTimeout(timer)
          if (reply.error !== undefined) reject(new Error(`调试协议请求 ${method} 失败：${JSON.stringify(reply.error)}`))
          else resolve(reply.result)
        },
        fail: (error) => { clearTimeout(timer); reject(error) },
      })
      try {
        socket.send(JSON.stringify({ id, method, params }))
      } catch (error) {
        clearTimeout(timer)
        pendingReplies.delete(id)
        reject(error)
      }
    })
  const evaluate = async (expression: string): Promise<unknown> => {
    const result = (await request('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })) as {
      result: { value?: unknown }
      exceptionDetails?: { text: string; exception?: { description?: string } }
    }
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  return new Promise((resolve, reject) => {
    const close = (): void => { failPending(disconnected()); socket.close() }
    const connectionTimer = setTimeout(() => {
      reject(new Error(`连接 ZCode 调试端口 ${RPC_TIMEOUT_MS / 1000} 秒无响应`))
      close()
    }, RPC_TIMEOUT_MS)
    socket.onopen = () => { clearTimeout(connectionTimer); resolve({ evaluate, close }) }
    socket.onclose = () => {
      clearTimeout(connectionTimer)
      const error = disconnected()
      failPending(error)
      reject(error)
    }
    socket.onerror = () => {
      clearTimeout(connectionTimer)
      reject(new Error('连不上 ZCode 调试端口的 WebSocket'))
      close()
    }
  })
}

async function openConnection(): Promise<OpenConnection> {
  const mainProcess = await findZCodeMainProcess()
  requireRemoteDebuggingArgument(mainProcess)
  const socket = await connectWebSocket(findWorkspaceWindowTarget(await listPageTargets()))
  const evaluateInWindow = socket.evaluate
  const call = (service: DesktopServiceName, method: string, args: unknown): Promise<unknown> =>
    evaluateInWindow(`${findServiceInRenderer(service)}[${JSON.stringify(method)}](${JSON.stringify(args)})`)
  const readActiveWorkspacePath = async (): Promise<string> => {
    const paths = (await evaluateInWindow(READ_ACTIVE_WORKSPACE_PATHS)) as string[]
    if (paths.length !== 1 || paths[0] === undefined) {
      throw new Error(`窗口的 React 树里 activeWorkspacePath 应有一个值，实际是 ${JSON.stringify(paths)}，ZCode 内部结构可能变了`)
    }
    return paths[0]
  }
  const readConversationClientId = async (): Promise<string> => {
    const clientId = await evaluateInWindow(READ_CONVERSATION_CLIENT_ID)
    if (typeof clientId !== 'string' || clientId === '') {
      throw new Error('窗口的 localStorage 里没有 zcode-v4-client-id:v1，ZCode 内部结构可能变了')
    }
    return clientId
  }
  const close = async (): Promise<void> => socket.close()
  return { call, readActiveWorkspacePath, readConversationClientId, executablePath: mainProcess.executablePath, close }
}

/**
 * 同一 home 同时跑的命令共用连接，最后一个用完只断开这条 WebSocket。
 * 不同 home 各用各的连接，共用的 ZCode 调试端口不由任何一个 home 擅自关闭。
 */
let sharedConnection: { opening: Promise<OpenConnection>; users: number } | undefined
let closingConnection: Promise<void> = Promise.resolve()

export async function withDesktop<T>(
  warn: (message: string) => void,
  work: (services: DesktopServices) => Promise<T>,
): Promise<T> {
  await closingConnection
  if (sharedConnection === undefined) {
    const opening = openConnection()
    sharedConnection = { opening, users: 0 }
    opening.catch(() => {
      if (sharedConnection?.opening === opening) sharedConnection = undefined
    })
  }
  const current = sharedConnection
  current.users++
  try {
    return await work(await current.opening)
  } finally {
    current.users--
    if (current.users === 0 && sharedConnection === current) {
      sharedConnection = undefined
      // 任务已经发出去了，清理连接失败不能盖过成功回执。
      closingConnection = current.opening.then(
        (connection) => connection.close().catch((error: unknown) => warn(`断开 ZCode 调试连接失败：${String(error)}`)),
        () => undefined,
      )
      await closingConnection
    }
  }
}
