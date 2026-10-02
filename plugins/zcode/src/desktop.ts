import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/**
 * 连到运行中的 ZCode 桌面端：给主进程打开 Node 调试端口 9229，经 Electron 在工作区窗口里执行脚本，
 * 调客户端自己的 zcodeTaskService。ZCode 没有给外部用的建任务入口，这是唯一能让任务进侧栏的办法，
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

const FIND_TASK_SERVICE_IN_RENDERER = `(()=>{
  const root=document.getElementById('root');
  const containerKey=Object.keys(root).find(k=>k.startsWith('__reactContainer'));
  const start=root[containerKey], seen=new Set(), queue=[start,start?.stateNode?.current];
  while(queue.length){const fiber=queue.shift();if(!fiber||seen.has(fiber))continue;seen.add(fiber);
    const service=fiber.memoizedProps?.services?.zcodeTaskService;if(service)return service;
    queue.push(fiber.child,fiber.sibling,fiber.alternate);}
  throw new Error('窗口的 React 树里找不到 services.zcodeTaskService，ZCode 内部结构可能变了');
})()`

export interface DesktopTaskService {
  call(method: string, args: unknown): Promise<unknown>
}

interface OpenConnection extends DesktopTaskService {
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
  const response = await fetch(INSPECTOR_LIST_URL)
  return (await response.json()) as { webSocketDebuggerUrl?: string }[]
}

/** 端口没开时 fetch 连接失败，这时给主进程发信号打开它；openedByUs 决定结束时要不要关掉 */
async function openInspector(processId: number): Promise<{ webSocketUrl: string; openedByUs: boolean }> {
  const firstUrl = (targets: { webSocketDebuggerUrl?: string }[]): string => {
    const url = targets[0]?.webSocketDebuggerUrl
    if (url === undefined) throw new Error(`${INSPECTOR_LIST_URL} 里没有可连接的目标`)
    return url
  }
  try {
    return { webSocketUrl: firstUrl(await listInspectorTargets()), openedByUs: false }
  } catch {
    ;(process as unknown as { _debugProcess(pid: number): void })._debugProcess(processId)
    for (let attempt = 0; attempt < 30; attempt++) {
      await sleep(100)
      try {
        return { webSocketUrl: firstUrl(await listInspectorTargets()), openedByUs: true }
      } catch {}
    }
    throw new Error(`给 ZCode 主进程（pid ${processId}）打开调试端口后 3 秒内 ${INSPECTOR_LIST_URL} 仍连不上`)
  }
}

function connectWebSocket(webSocketUrl: string): Promise<{ evaluate(expression: string): Promise<unknown>; close(): void }> {
  const socket = new WebSocket(webSocketUrl)
  let nextRequestId = 0
  const pendingReplies = new Map<number, (reply: { result?: unknown; error?: unknown }) => void>()
  socket.onmessage = (event) => {
    const reply = JSON.parse(String(event.data)) as { id: number; result?: unknown; error?: unknown }
    pendingReplies.get(reply.id)?.(reply)
    pendingReplies.delete(reply.id)
  }
  const request = (method: string, params: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = ++nextRequestId
      const timer = setTimeout(() => {
        pendingReplies.delete(id)
        reject(new Error(`调试协议请求 ${method} ${RPC_TIMEOUT_MS / 1000} 秒无响应；如果是在发送指令，先去 ZCode 侧栏确认有没有发出去再重试`))
      }, RPC_TIMEOUT_MS)
      pendingReplies.set(id, (reply) => {
        clearTimeout(timer)
        if (reply.error !== undefined) reject(new Error(`调试协议请求 ${method} 失败：${JSON.stringify(reply.error)}`))
        else resolve(reply.result)
      })
      socket.send(JSON.stringify({ id, method, params }))
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
    socket.onopen = () => resolve({ evaluate, close: () => socket.close() })
    socket.onerror = () => reject(new Error(`连不上调试端口的 WebSocket：${webSocketUrl}`))
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
  const { webSocketUrl, openedByUs } = await openInspector(processId)
  const socket = await connectWebSocket(webSocketUrl)
  const close = async (): Promise<void> => {
    try {
      if (openedByUs) await socket.evaluate('setTimeout(()=>process.getBuiltinModule("inspector").close(),200); true')
    } finally {
      socket.close()
    }
  }
  try {
    const inspectedProcessId = await socket.evaluate('process.pid')
    if (inspectedProcessId !== processId) throw new Error(`${INSPECTOR_PORT} 端口属于 pid ${String(inspectedProcessId)}，不是 ZCode 主进程 ${processId}`)
    const windowId = await findWorkspaceWindowId(socket.evaluate)
    const call = (method: string, args: unknown): Promise<unknown> =>
      socket.evaluate(
        `${ELECTRON_MODULE}.BrowserWindow.fromId(${windowId}).webContents.executeJavaScript(${JSON.stringify(
          `${FIND_TASK_SERVICE_IN_RENDERER}[${JSON.stringify(method)}](${JSON.stringify(args)})`,
        )})`,
      )
    return { call, close }
  } catch (error) {
    // 连上之后的核对没过，关掉自己打开的端口再报原来的错；关不掉不能盖过原来的错
    await close().catch(() => undefined)
    throw error
  }
}

/**
 * 同时跑的几条命令共用一个连接：最后一个用完才关端口。关端口是异步的（ZCode 那边 200 毫秒后才真正关），
 * 正在关的时候来了新的使用者，要等它关完再重新打开，否则新连接会被这次关闭一起关掉。
 */
let sharedConnection: { opening: Promise<OpenConnection>; users: number } | undefined
let closingConnection: Promise<void> = Promise.resolve()

export async function withDesktop<T>(
  warn: (message: string) => void,
  work: (taskService: DesktopTaskService) => Promise<T>,
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
      // 任务已经发出去了，关端口失败不能让命令报错丢掉回执；端口可能还开着，写进日志
      closingConnection = current.opening.then(
        (connection) => connection.close().catch((error: unknown) => warn(`关闭 ZCode 调试端口 ${INSPECTOR_PORT} 失败：${String(error)}`)),
        () => undefined,
      )
      await closingConnection
    }
  }
}
