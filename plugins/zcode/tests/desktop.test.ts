import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  execFile: (_file: string, _args: string[], _options: unknown, callback: (error: null, result: unknown) => void) =>
    callback(null, { stdout: '123' }),
}))

// Two independently loaded plugin modules represent two homes sharing one inspector.
// Closing the inspector from either home interrupts every connection, just as Node does.
class InspectorSocket {
  static sockets: InspectorSocket[] = []
  static listening = false
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
    let value: unknown = 'service-result'
    if (expression === 'process.pid') value = 123
    else if (expression === 'process.execPath') value = 'ZCode.exe'
    else if (expression.includes('getAllWindows()')) value = [1]
    else if (expression.includes('"inspector").close()')) {
      value = true
      setTimeout(() => {
        InspectorSocket.listening = false
        for (const socket of InspectorSocket.sockets) socket.close()
      }, 200)
    }
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
  InspectorSocket.listening = false
  InspectorSocket.dropReplies = false
  InspectorSocket.serviceDelayMs = 0
  vi.stubGlobal('WebSocket', InspectorSocket)
  vi.stubGlobal('fetch', async () => {
    if (!InspectorSocket.listening) throw new Error('ECONNREFUSED')
    return { json: async () => [{ webSocketDebuggerUrl: 'ws://127.0.0.1:9229/test' }] }
  })
  vi.spyOn(process as unknown as { _debugProcess(pid: number): void }, '_debugProcess')
    .mockImplementation(() => { InspectorSocket.listening = true })
})

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

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
