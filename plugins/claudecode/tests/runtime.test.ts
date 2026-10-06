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
  it('提示词走 stdin，返回 accepted 后由 result 事件保存；不持久化提示词与工具事件，回答原样保存', async () => {
    const { runtime, children, read } = setup()
    const hex = 'b'.repeat(64)
    const reply = await runtime.create({ workspace, prompt: `私有提示词 ${hex}` })
    expect(reply).toMatchObject({ accepted: true, round: 1 })
    const args = vi.mocked(spawn).mock.calls[0]!
    expect(args[1]).toContain('--session-id')
    expect(args[1]).toEqual(expect.arrayContaining(['--permission-mode', 'bypassPermissions']))
    expect(JSON.stringify(args)).not.toContain('私有提示词')
    expect(args[2]).toMatchObject({ shell: false, windowsHide: true })
    const input: unknown = children[0]!.stdin.read()
    expect(Buffer.isBuffer(input) ? input.toString() : input).toContain('私有提示词')
    children[0]!.stdout.write(JSON.stringify({ type: 'assistant', content: '工具事件' }) + '\n')
    children[0]!.finish(reply.sessionId, `结果 ${hex}`)
    await vi.waitFor(async () => expect(await runtime.status({ workspace, sessionId: reply.sessionId })).toMatchObject({ status: 'completed', text: `结果 ${hex}` }))
    expect(JSON.stringify(read())).not.toContain('私有提示词')
    expect(JSON.stringify(read())).not.toContain('工具事件')
  })
  it('续聊等这条会话上一轮的进程 close，再以相同 ID resume', async () => {
    const { runtime, children } = setup()
    const first = await runtime.create({ workspace, prompt: '第一轮' })
    let resumed = false
    const next = runtime.send({ workspace, sessionId: first.sessionId, prompt: '第二轮' }).then((r) => { resumed = true; return r })
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(resumed).toBe(false)
    expect(children).toHaveLength(1)
    children[0]!.finish(first.sessionId, '第一轮完成')
    await expect(next).resolves.toMatchObject({ sessionId: first.sessionId, round: 2 })
    expect(vi.mocked(spawn).mock.calls[1]![1]).toContain('--resume')
    expect(vi.mocked(spawn).mock.calls[1]![1]).toEqual(expect.arrayContaining(['--permission-mode', 'bypassPermissions']))
    children[1]!.finish(first.sessionId, '第二轮完成')
  })
  it('同一个工作区可以同时开两条会话', async () => {
    const { runtime, children } = setup()
    const first = await runtime.create({ workspace, prompt: '第一条' })
    const second = await runtime.create({ workspace, prompt: '第二条' })
    expect(second.sessionId).not.toBe(first.sessionId)
    expect(children).toHaveLength(2)
    children[0]!.finish(first.sessionId, '一'); children[1]!.finish(second.sessionId, '二')
  })
  it('记录里上次没收尾的 running / unknown 读回时按中断失败收尾，可以续聊', async () => {
    const otherId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'
    const { runtime } = setup({ version: 1, sessions: [
      { sessionId: storedId, workspace, round: 1, status: 'running', text: '' },
      { sessionId: otherId, workspace, round: 2, status: 'unknown', text: '' },
    ] })
    await expect(runtime.status({ workspace, sessionId: storedId })).resolves.toMatchObject({ status: 'failed', text: expect.stringContaining('被结束') as unknown })
    await expect(runtime.status({ workspace, sessionId: otherId })).resolves.toMatchObject({ status: 'failed' })
    await expect(runtime.status({ workspace: 'D:/other-workspace', sessionId: storedId })).rejects.toThrow('不是本 home')
    await expect(runtime.send({ workspace, sessionId: storedId, prompt: '继续' })).resolves.toMatchObject({ round: 2 })
  })
  it('卸载时结束在跑的进程，那一轮记失败', async () => {
    const { runtime, read } = setup()
    const reply = await runtime.create({ workspace, prompt: '长任务' })
    await runtime.dispose()
    expect(JSON.stringify(read())).toContain('被结束')
    expect(read()).toMatchObject({ sessions: [{ sessionId: reply.sessionId, status: 'failed' }] })
  })
  it('取值不对直接报错，不启动进程', async () => {
    const { runtime, children } = setup()
    await expect(runtime.create({ workspace: 'relative', prompt: '任务' })).rejects.toThrow('绝对路径')
    await expect(runtime.create({ workspace, prompt: '   ' })).rejects.toThrow('prompt')
    await expect(runtime.send({ workspace, sessionId: 'not-a-uuid', prompt: '任务' })).rejects.toThrow('UUID')
    expect(children).toHaveLength(0)
  })
  it('存储失败不启动进程，后续请求保持失败', async () => {
    const { runtime, deps, children } = setup()
    deps.write = async () => { throw new Error('disk unavailable') }
    await expect(runtime.create({ workspace, prompt: '任务' })).rejects.toThrow('disk unavailable')
    await expect(runtime.create({ workspace, prompt: '仍不启动' })).rejects.toThrow('disk unavailable')
    expect(children).toHaveLength(0)
  })
  it('没有本会话 result 或非零退出，不把进程关闭标记为完成', async () => {
    const { runtime, children } = setup()
    const reply = await runtime.create({ workspace, prompt: '任务' })
    children[0]!.finish(storedId, '别的会话结果')
    await vi.waitFor(async () => expect((await runtime.status({ workspace, sessionId: reply.sessionId })).status).toBe('failed'))
  })
})
