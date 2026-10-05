import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/**
 * 连到运行中的 ZCode 桌面端：给主进程打开 Node 调试端口 9229，经 Electron 在工作区窗口里执行脚本，
 * 调客户端自己的服务。ZCode 没有给外部用的建任务入口，这是唯一能让任务进侧栏的办法，
 * 依赖的 React 树结构与服务方法名都是 ZCode 内部的，升级后可能要改这里。
 */

const execFileAsync = promisify(execFile)
const INSPECTOR_PORT = 9229
const INSPECTOR_LIST_URL = `http://127.0.0.1:${INSPECTOR_PORT}/json/list`
const RPC_TIMEOUT_MS = 30_000

const FIND_MAIN_PROCESS_SCRIPT =
  '$p = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "ZCode.exe" -and $_.CommandLine -notmatch "--type=|zcode.cjs|windows-helper" }); ' +
  'if ($p.Count -ne 1) { throw "应有一个 ZCode 主进程，实际 $($p.Count) 个：ZCode 桌面端没开，或开了多个实例" }; $p[0].ProcessId'

const ELECTRON_MODULE = 'process.getBuiltinModule("module").createRequire(process.execPath)("electron")'

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
  /** ZCode 主进程的 ZCode.exe 路径 */
  executablePath: string
}

interface OpenConnection extends DesktopServices {
  close(): Promise<void>
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function findZCodeMainProcessId(): Promise<number> {
  let stdout: string
  try {
    ;({ stdout } = await execFileAsync('pwsh', ['-NoProfile', '-Command', FIND_MAIN_PROCESS_SCRIPT], { windowsHide: true }))
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim()
    throw new Error(`找 ZCode 主进程失败：${stderr || (error as Error).message}`)
  }
  const processId = Number(stdout.trim())
  if (!Number.isInteger(processId) || processId <= 0) throw new Error(`找 ZCode 主进程时 pwsh 输出的不是 pid：${stdout}`)
  return processId
}

async function listInspectorTargets(): Promise<{ webSocketDebuggerUrl?: string }[]> {
  const response = await fetch(INSPECTOR_LIST_URL, { signal: AbortSignal.timeout(3_000) })
  return (await response.json()) as { webSocketDebuggerUrl?: string }[]
}

/** 端口属于 ZCode 进程，可能被多个 home 共用；这里只确保打开，不取得关闭整个端口的所有权。 */
async function openInspector(processId: number): Promise<string> {
  const firstUrl = (targets: { webSocketDebuggerUrl?: string }[]): string => {
    const url = targets[0]?.webSocketDebuggerUrl
    if (url === undefined) throw new Error(`${INSPECTOR_LIST_URL} 里没有可连接的目标`)
    return url
  }
  try {
    return firstUrl(await listInspectorTargets())
  } catch {
    ;(process as unknown as { _debugProcess(pid: number): void })._debugProcess(processId)
    for (let attempt = 0; attempt < 30; attempt++) {
      await sleep(100)
      try {
        return firstUrl(await listInspectorTargets())
      } catch {}
    }
    throw new Error(`给 ZCode 主进程（pid ${processId}）打开调试端口后 3 秒内 ${INSPECTOR_LIST_URL} 仍连不上`)
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

async function findWorkspaceWindowId(evaluate: (expression: string) => Promise<unknown>): Promise<number> {
  const windowIds = (await evaluate(
    `${ELECTRON_MODULE}.BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('/out/renderer/index.html')).map(w=>w.id)`,
  )) as number[]
  if (windowIds.length !== 1 || windowIds[0] === undefined) throw new Error(`应有一个 ZCode 工作区窗口，实际 ${windowIds.length} 个`)
  return windowIds[0]
}

async function openConnection(): Promise<OpenConnection> {
  const processId = await findZCodeMainProcessId()
  const webSocketUrl = await openInspector(processId)
  const socket = await connectWebSocket(webSocketUrl)
  const close = async (): Promise<void> => {
    // 只释放自己的连接。inspector.close() 会中断其他 home/调试器，并可能阻塞主进程。
    // 端口随 ZCode 进程退出而关闭，不能用本 home 的引用计数推断全局无人使用。
    socket.close()
  }
  try {
    const inspectedProcessId = await socket.evaluate('process.pid')
    if (inspectedProcessId !== processId) throw new Error(`${INSPECTOR_PORT} 端口属于 pid ${String(inspectedProcessId)}，不是 ZCode 主进程 ${processId}`)
    const windowId = await findWorkspaceWindowId(socket.evaluate)
    const evaluateInWindow = (expression: string): Promise<unknown> =>
      socket.evaluate(`${ELECTRON_MODULE}.BrowserWindow.fromId(${windowId}).webContents.executeJavaScript(${JSON.stringify(expression)})`)
    const call = (service: DesktopServiceName, method: string, args: unknown): Promise<unknown> =>
      evaluateInWindow(`${findServiceInRenderer(service)}[${JSON.stringify(method)}](${JSON.stringify(args)})`)
    const readActiveWorkspacePath = async (): Promise<string> => {
      const paths = (await evaluateInWindow(READ_ACTIVE_WORKSPACE_PATHS)) as string[]
      if (paths.length !== 1 || paths[0] === undefined) {
        throw new Error(`窗口的 React 树里 activeWorkspacePath 应有一个值，实际是 ${JSON.stringify(paths)}，ZCode 内部结构可能变了`)
      }
      return paths[0]
    }
    const executablePath = (await socket.evaluate('process.execPath')) as string
    return { call, readActiveWorkspacePath, executablePath, close }
  } catch (error) {
    // 核对没过只断开自己的连接，不在未知进程里执行关闭端口的脚本。
    await close().catch(() => undefined)
    throw error
  }
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
