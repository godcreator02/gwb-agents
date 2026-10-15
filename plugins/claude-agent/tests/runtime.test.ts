import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClaudeAgentRuntime, type PreparedRound, type RuntimeDeps } from '../src/runtime.js'
import type { SdkQuery, SdkQueryOptions } from '../src/sdk-types.js'

/** 假的一轮：测试往里推消息、结束它；close() 像 SDK 那样让迭代抛错结束 */
class FakeRound implements SdkQuery {
  private readonly pending: unknown[] = []
  private wake: (() => void) | undefined
  private ended = false
  private closedError: Error | undefined
  /** 像 SDK 那样经 spawnClaudeCodeProcess 启动 Claude Code */
  readonly pid: number | undefined
  constructor(readonly prompt: string, readonly options: SdkQueryOptions) {
    this.pid = options.spawnClaudeCodeProcess({ command: 'claude.exe', args: [], env: options.env, signal: new AbortController().signal }).pid
  }
  push(message: unknown): void { this.pending.push(message); this.wake?.() }
  end(): void { this.ended = true; this.wake?.() }
  close(): void { this.closedError = new Error('aborted by close()'); this.wake?.() }
  async *[Symbol.asyncIterator](): AsyncIterator<unknown> {
    for (;;) {
      if (this.closedError !== undefined) throw this.closedError
      const next = this.pending.shift()
      if (next !== undefined) { yield next; continue }
      if (this.ended) return
      await new Promise<void>((resolve) => { this.wake = resolve })
    }
  }
}

const workspace = process.cwd()
const storedId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const runtimes: ClaudeAgentRuntime[] = []

function setup(initial?: unknown) {
  let doc = initial
  const rounds: FakeRound[] = []
  const prepareRound = vi.fn<RuntimeDeps['prepareRound']>(async (modelName) => {
    const round: PreparedRound = {
      query: ({ prompt, options }) => { const fake = new FakeRound(prompt, options); rounds.push(fake); return fake },
      model: modelName === 'deepseek' ? 'deepseek-v4-pro' : undefined,
      env: { MARK: 'env' },
    }
    return { modelName: modelName ?? null, round }
  })
  let nextPid = 1000
  /** 结束进程树：那个 pid 的一轮像进程被结束那样迭代抛错 */
  const endProcessTree = vi.fn<RuntimeDeps['endProcessTree']>(async (pid) => { rounds.find((round) => round.pid === pid)?.close() })
  const deps: RuntimeDeps = {
    prepareRound,
    readSessions: async () => structuredClone(doc),
    writeSessions: async (value) => { doc = structuredClone(value) },
    error: vi.fn(),
    spawnClaudeCode: () => ({ pid: nextPid++ }) as ChildProcess,
    endProcessTree,
  }
  const runtime = new ClaudeAgentRuntime(deps)
  runtimes.push(runtime)
  return { runtime, deps, rounds, prepareRound, endProcessTree, read: () => doc }
}

const result = (text: string, failed = false) => ({ type: 'result', subtype: failed ? 'error_during_execution' : 'success', is_error: failed, result: text })
const assistant = (content: unknown[], parent: string | null = null) => ({ type: 'assistant', parent_tool_use_id: parent, message: { content } })

afterEach(async () => { await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose())) })

describe('claude-agent 会话', () => {
  it('新会话用自己定的 UUID 开一轮，bypassPermissions，结果存盘；不存提示词', async () => {
    const { runtime, rounds, read } = setup()
    const started = await runtime.create({ workspace, prompt: '私有提示词', model: 'deepseek' })
    expect(started).toMatchObject({ round: 1, model: 'deepseek', accepted: true })
    expect(rounds[0]!.options).toMatchObject({ cwd: workspace, sessionId: started.sessionId, model: 'deepseek-v4-pro', env: { MARK: 'env' }, permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true })
    expect(rounds[0]!.options.resume).toBeUndefined()
    rounds[0]!.push(result('做完了'))
    rounds[0]!.end()
    await vi.waitFor(async () => expect(await runtime.status({ workspace, sessionId: started.sessionId })).toMatchObject({ status: 'completed', text: '做完了', progress: null }))
    expect(JSON.stringify(read())).not.toContain('私有提示词')
  })

  it('跑着时 status 带进度：只记主代理的文字与工具调用', async () => {
    const { runtime, rounds } = setup()
    const started = await runtime.create({ workspace, prompt: '任务' })
    rounds[0]!.push(assistant([{ type: 'text', text: '先读文件' }, { type: 'tool_use', name: 'Read' }]))
    rounds[0]!.push(assistant([{ type: 'tool_use', name: 'Grep' }], 'toolu_sub'))
    rounds[0]!.push(assistant([{ type: 'tool_use', name: 'Edit' }]))
    await vi.waitFor(async () => expect((await runtime.status({ workspace, sessionId: started.sessionId })).progress).toEqual({ toolCalls: 2, lastTool: 'Edit', lastText: '先读文件' }))
    rounds[0]!.end()
  })

  it('续聊用 resume，沿用会话记下的模型；上一轮还在跑时不带 interrupt 报错', async () => {
    const { runtime, rounds, prepareRound } = setup()
    const started = await runtime.create({ workspace, prompt: '第一轮', model: 'deepseek' })
    await expect(runtime.send({ workspace, sessionId: started.sessionId, prompt: '第二轮' })).rejects.toThrow('interrupt')
    rounds[0]!.push(result('一'))
    rounds[0]!.end()
    await vi.waitFor(async () => expect((await runtime.status({ workspace, sessionId: started.sessionId })).status).toBe('completed'))
    await expect(runtime.send({ workspace, sessionId: started.sessionId, prompt: '第二轮' })).resolves.toMatchObject({ round: 2, model: 'deepseek' })
    expect(prepareRound).toHaveBeenLastCalledWith('deepseek')
    expect(rounds[1]!.options).toMatchObject({ resume: started.sessionId })
    expect(rounds[1]!.options.sessionId).toBeUndefined()
    rounds[1]!.end()
  })

  it('带 interrupt 时先结束上一轮的进程树（记 failed、写明被打断），再开下一轮', async () => {
    const { runtime, rounds, endProcessTree, read } = setup()
    const started = await runtime.create({ workspace, prompt: '长任务' })
    await expect(runtime.send({ workspace, sessionId: started.sessionId, prompt: '换个做法', interrupt: true })).resolves.toMatchObject({ round: 2 })
    expect(endProcessTree).toHaveBeenCalledExactlyOnceWith(rounds[0]!.pid)
    expect(rounds).toHaveLength(2)
    expect(JSON.stringify(read())).not.toContain('被下一轮打断') // 第二轮开始时会话已切到 running
    rounds[1]!.push(result('新做法完成'))
    rounds[1]!.end()
    await vi.waitFor(async () => expect(await runtime.status({ workspace, sessionId: started.sessionId })).toMatchObject({ round: 2, status: 'completed', text: '新做法完成' }))
  })

  it('进程树结束不了时 send 报错、不开下一轮，上一轮照常收尾', async () => {
    const { runtime, rounds, endProcessTree } = setup()
    const started = await runtime.create({ workspace, prompt: '长任务' })
    endProcessTree.mockRejectedValueOnce(new Error('结束 Claude Code 进程树（pid 1000）失败'))
    await expect(runtime.send({ workspace, sessionId: started.sessionId, prompt: '换个做法', interrupt: true })).rejects.toThrow('进程树')
    expect(rounds).toHaveLength(1)
    rounds[0]!.push(result('还是做完了'))
    rounds[0]!.end()
    await vi.waitFor(async () => expect(await runtime.status({ workspace, sessionId: started.sessionId })).toMatchObject({ round: 1, status: 'completed', text: '还是做完了' }))
  })

  it('出错的 result、没有 result、迭代抛错都记 failed', async () => {
    const { runtime, rounds } = setup()
    const errored = await runtime.create({ workspace, prompt: '一' })
    rounds[0]!.push({ type: 'result', subtype: 'error_max_turns', is_error: true, errors: ['到了轮数上限'] })
    rounds[0]!.end()
    const silent = await runtime.create({ workspace, prompt: '二' })
    rounds[1]!.end()
    const thrown = await runtime.create({ workspace, prompt: '三' })
    rounds[2]!.close()
    await vi.waitFor(async () => {
      expect(await runtime.status({ workspace, sessionId: errored.sessionId })).toMatchObject({ status: 'failed', text: '到了轮数上限' })
      expect(await runtime.status({ workspace, sessionId: silent.sessionId })).toMatchObject({ status: 'failed', text: expect.stringContaining('没有交回 result') as unknown })
      expect(await runtime.status({ workspace, sessionId: thrown.sessionId })).toMatchObject({ status: 'failed', text: expect.stringContaining('aborted') as unknown })
    })
  })

  it('记录里上次没收尾的 running 读回时按中断失败收尾，可以续聊', async () => {
    const { runtime } = setup({ version: 1, sessions: [{ sessionId: storedId, workspace, model: null, round: 1, status: 'running', text: '' }] })
    await expect(runtime.status({ workspace, sessionId: storedId })).resolves.toMatchObject({ status: 'failed', text: expect.stringContaining('被结束') as unknown })
    await expect(runtime.status({ workspace: 'D:/other-workspace', sessionId: storedId })).rejects.toThrow('不是本 home')
    await expect(runtime.send({ workspace, sessionId: storedId, prompt: '继续' })).resolves.toMatchObject({ round: 2, model: null })
  })

  it('卸载时结束在跑的一轮的进程树，那一轮记失败', async () => {
    const { runtime, rounds, endProcessTree, read } = setup()
    const started = await runtime.create({ workspace, prompt: '长任务' })
    await runtime.dispose()
    expect(endProcessTree).toHaveBeenCalledExactlyOnceWith(rounds[0]!.pid)
    expect(read()).toMatchObject({ sessions: [{ sessionId: started.sessionId, status: 'failed', text: expect.stringContaining('被结束') as unknown }] })
  })

  it('取值不对或配置不对直接报错，不开这一轮', async () => {
    const { runtime, rounds, prepareRound } = setup()
    await expect(runtime.create({ workspace: 'relative', prompt: '任务' })).rejects.toThrow('绝对路径')
    await expect(runtime.create({ workspace, prompt: '   ' })).rejects.toThrow('prompt')
    await expect(runtime.send({ workspace, sessionId: 'not-a-uuid', prompt: '任务' })).rejects.toThrow('UUID')
    prepareRound.mockRejectedValueOnce(new Error('没配设置 sdk-dir'))
    await expect(runtime.create({ workspace, prompt: '任务' })).rejects.toThrow('sdk-dir')
    expect(rounds).toHaveLength(0)
  })

  it('存盘失败不开这一轮，后续请求保持失败', async () => {
    const { runtime, deps, rounds } = setup()
    deps.writeSessions = async () => { throw new Error('disk unavailable') }
    await expect(runtime.create({ workspace, prompt: '任务' })).rejects.toThrow('disk unavailable')
    await expect(runtime.create({ workspace, prompt: '仍不开' })).rejects.toThrow('disk unavailable')
    expect(rounds).toHaveLength(0)
  })
})
