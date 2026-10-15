import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MAIN_PROCESS = { executablePath: 'C:\\ZCode\\ZCode.exe', commandLine: '"C:\\ZCode\\ZCode.exe" --remote-debugging-port=9339' }

vi.mock('node:child_process', () => ({
  execFile: (_file: string, _args: string[], _options: unknown, callback: (error: null, result: unknown) => void) =>
    callback(null, { stdout: JSON.stringify(MAIN_PROCESS) }),
}))

// Two independently loaded plugin modules represent two homes sharing one remote debugging port.
class InspectorSocket {
  static sockets: InspectorSocket[] = []
  static dropReplies = false
  static serviceDelayMs = 0
  onopen?: () => void
  onmessage?: (event: { data: string }) => void
  onclose?: () => void
  onerror?: () => void
  readyState = 0
  constructor() {
    InspectorSocket.sockets.push(this)
    queueMicrotask(() => { this.readyState = 1; this.onopen?.() })
  }
  send(raw: string): void {
    if (this.readyState !== 1) throw new Error('WebSocket is not open')
    if (InspectorSocket.dropReplies) return
    const { id, params } = JSON.parse(raw) as { id: number; params: { expression: string } }
    const expression = params.expression
    const value: unknown = expression.includes('services?.') ? 'service-result' : null
    const reply = () => {
      if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify({ id, result: { result: { value } } }) })
    }
    if (value === 'service-result' && InspectorSocket.serviceDelayMs) setTimeout(reply, InspectorSocket.serviceDelayMs)
    else queueMicrotask(reply)
  }
  close(): void {
    if (this.readyState === 3) return
    this.readyState = 3
    this.onclose?.()
  }
}

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  InspectorSocket.sockets = []
  InspectorSocket.dropReplies = false
  InspectorSocket.serviceDelayMs = 0
  vi.stubGlobal('WebSocket', InspectorSocket)
  vi.stubGlobal('fetch', async () => ({
    json: async () => [{ type: 'page', url: 'file:///C:/ZCode/resources/app.asar/out/renderer/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9339/test' }],
  }))
})

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('remote debugging argument', () => {
  it('accepts the exact argument as its own token', async () => {
    const { requireRemoteDebuggingArgument } = await import('../src/desktop.js')
    expect(() => requireRemoteDebuggingArgument(MAIN_PROCESS)).not.toThrow()
  })

  it('rejects a ZCode started without it, or with another port, and says how to relaunch', async () => {
    const { requireRemoteDebuggingArgument } = await import('../src/desktop.js')
    for (const commandLine of ['"C:\\ZCode\\ZCode.exe"', '"C:\\ZCode\\ZCode.exe" --remote-debugging-port=93390']) {
      expect(() => requireRemoteDebuggingArgument({ ...MAIN_PROCESS, commandLine }))
        .toThrow('用 "C:\\ZCode\\ZCode.exe" --remote-debugging-port=9339 重开')
    }
  })
})

describe('workspace window target', () => {
  const workspaceWindow = { type: 'page', url: 'file:///C:/ZCode/resources/app.asar/out/renderer/index.html?x=1', webSocketDebuggerUrl: 'ws://window' }

  it('picks the one workspace window among other pages and workers', async () => {
    const { findWorkspaceWindowTarget } = await import('../src/desktop.js')
    expect(findWorkspaceWindowTarget([
      { type: 'page', url: 'file:///C:/ZCode/resources/app.asar/out/renderer/login.html', webSocketDebuggerUrl: 'ws://login' },
      { type: 'service_worker', url: 'file:///C:/ZCode/resources/app.asar/out/renderer/index.html', webSocketDebuggerUrl: 'ws://worker' },
      workspaceWindow,
    ])).toBe('ws://window')
  })

  it('refuses zero or several workspace windows', async () => {
    const { findWorkspaceWindowTarget } = await import('../src/desktop.js')
    expect(() => findWorkspaceWindowTarget([])).toThrow('实际 0 个')
    expect(() => findWorkspaceWindowTarget([workspaceWindow, workspaceWindow])).toThrow('实际 2 个')
  })
})

describe('desktop connection ownership', () => {
  it('one home finishing must not interrupt another home querying ZCode', async () => {
    const homeA = await import('../src/desktop.js')
    vi.resetModules()
    const homeB = await import('../src/desktop.js')
    const releaseA = deferred()
    const enteredA = deferred()
    const enteredB = deferred()
    const first = homeA.withDesktop(vi.fn(), async () => { enteredA.resolve(); await releaseA.promise })
    await vi.advanceTimersByTimeAsync(100)
    await enteredA.promise
    const second = homeB.withDesktop(vi.fn(), async (services) => {
      InspectorSocket.serviceDelayMs = 500
      const pending = services.call('zcodeTaskService', 'getTaskSnapshot', {})
      enteredB.resolve()
      return pending
    })
    const outcome = second.then((value) => ({ value }), (error: unknown) => ({ error }))
    await enteredB.promise
    releaseA.resolve()
    await first
    await vi.advanceTimersByTimeAsync(250)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await outcome).toEqual({ value: 'service-result' })
    expect(InspectorSocket.sockets.every((socket) => socket.readyState === 3)).toBe(true)
  })

  it('a disconnected socket rejects in-flight calls immediately, without waiting 30 seconds', async () => {
    const { withDesktop } = await import('../src/desktop.js')
    let failure: unknown
    const work = withDesktop(vi.fn(), async (services) => {
      InspectorSocket.dropReplies = true
      const pending = services.call('zcodeTaskService', 'getTaskSnapshot', {})
      InspectorSocket.sockets[0]!.close()
      return pending
    }).catch((error: unknown) => { failure = error })
    await vi.advanceTimersByTimeAsync(101)
    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).toContain('连接已断开')
    await work
    expect(vi.getTimerCount()).toBe(0)
  })
})
