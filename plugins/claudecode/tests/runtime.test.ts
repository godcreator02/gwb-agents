import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClaudeRuntime, type RuntimeDeps } from '../src/runtime.js'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
class Process extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  kill() { this.emit('close', null); return true }
  finish(id: string, text: string, code = 0) {
    this.stdout.write(JSON.stringify({ type: 'result', session_id: id, result: text, is_error: code !== 0 }) + '\n')
    this.emit('close', code)
  }
}
const runtimes: ClaudeRuntime[] = []
const workspace = process.cwd()
const storedId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
function setup(initial?: unknown) {
  let doc = initial
  const children: Process[] = []
  vi.mocked(spawn).mockImplementation(() => {
    const child = new Process(); children.push(child)
    queueMicrotask(() => child.emit('spawn'))
    return child as unknown as ReturnType<typeof spawn>
  })
  const deps: RuntimeDeps = { executable: () => process.execPath, read: async () => structuredClone(doc), write: async (v) => { doc = structuredClone(v) }, error: vi.fn() }
  const runtime = new ClaudeRuntime(deps); runtimes.push(runtime)
  return { runtime, deps, children, read: () => doc }
}
afterEach(async () => { await Promise.all(runtimes.splice(0).map((r) => r.dispose())); vi.clearAllMocks() })
describe('Claude 原生进程会话', () => {
  it('提示词走 stdin，返回 accepted 后由 result 事件保存；不持久化提示词与工具事件', async () => {
    const { runtime, children, read } = setup()
    const ticket = 'b'.repeat(64)
    const reply = await runtime.submit({ workspace, prompt: `私有提示词 ${ticket}` }, false)
    expect(reply).toMatchObject({ accepted: true, round: 1 })
    const args = vi.mocked(spawn).mock.calls[0]!
    expect(args[1]).toContain('--session-id')
    expect(args[1]).toEqual(expect.arrayContaining(['--permission-mode', 'bypassPermissions']))
    expect(JSON.stringify(args)).not.toContain(ticket)
    expect(args[2]).toMatchObject({ shell: false, windowsHide: true })
    const input: unknown = children[0]!.stdin.read()
    expect(Buffer.isBuffer(input) ? input.toString() : input).toContain(ticket)
    children[0]!.stdout.write(JSON.stringify({ type: 'assistant', content: ticket }) + '\n')
    children[0]!.finish(reply.sessionId, `结果 ${ticket}`)
    await vi.waitFor(async () => expect((await runtime.status({ workspace, sessionId: reply.sessionId })).status).toBe('completed'))
    expect(JSON.stringify(read())).not.toContain(ticket)
    expect(JSON.stringify(read())).not.toContain('私有提示词')
  })
  it('回报工具仍在上一轮进程中时，续聊等待进程 close，再以相同 ID resume', async () => {
    const { runtime, children } = setup()
    const first = await runtime.submit({ workspace, prompt: '第一轮' }, false)
    let resumed = false
    const next = runtime.submit({ workspace, sessionId: first.sessionId, prompt: '第二轮' }, true).then((r) => { resumed = true; return r })
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(resumed).toBe(false)
    expect(children).toHaveLength(1)
    children[0]!.finish(first.sessionId, '第一轮已回报')
    await expect(next).resolves.toMatchObject({ sessionId: first.sessionId, round: 2 })
    expect(vi.mocked(spawn).mock.calls[1]![1]).toContain('--resume')
    expect(vi.mocked(spawn).mock.calls[1]![1]).toEqual(expect.arrayContaining(['--permission-mode', 'bypassPermissions']))
    children[1]!.finish(first.sessionId, '第二轮完成')
  })
  it('重载后的 running 变为 unknown，拒绝重派；人工核对后才允许续聊', async () => {
    const { runtime, children } = setup({ version: 1, sessions: [{ sessionId: storedId, workspace, round: 1, status: 'running', text: '' }] })
    await expect(runtime.status({ workspace, sessionId: storedId })).resolves.toMatchObject({ status: 'unknown' })
    await expect(runtime.submit({ workspace, sessionId: storedId, prompt: '不能重发' }, true)).rejects.toThrow('状态不明')
    expect(children).toHaveLength(0)
    await expect(runtime.status({ workspace: 'D:/other-workspace', sessionId: storedId })).rejects.toThrow('不是本 home')
    await runtime.resolve({ workspace, sessionId: storedId, confirmedStopped: true })
    await expect(runtime.submit({ workspace, sessionId: storedId, prompt: '继续' }, true)).resolves.toMatchObject({ round: 2 })
  })
  it('存储失败不启动进程，后续请求保持失败', async () => {
    const { runtime, deps, children } = setup()
    deps.write = async () => { throw new Error('disk unavailable') }
    await expect(runtime.submit({ workspace, prompt: '任务' }, false)).rejects.toThrow('disk unavailable')
    await expect(runtime.submit({ workspace, prompt: '仍不启动' }, false)).rejects.toThrow('disk unavailable')
    expect(children).toHaveLength(0)
  })
  it('没有本会话 result 或非零退出，不把进程关闭标记为完成', async () => {
    const { runtime, children } = setup()
    const reply = await runtime.submit({ workspace, prompt: '任务' }, false)
    children[0]!.finish(storedId, '别的会话结果')
    await vi.waitFor(async () => expect((await runtime.status({ workspace, sessionId: reply.sessionId })).status).toBe('failed'))
  })
})
