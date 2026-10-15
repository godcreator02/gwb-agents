import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type {
  ClaudeAgentCreateInput,
  ClaudeAgentProgress,
  ClaudeAgentRoundInput,
  ClaudeAgentSendInput,
  ClaudeAgentSession,
  ClaudeAgentSessionInput,
  ClaudeAgentStarted,
  ClaudeAgentStatus,
} from './api.js'
import type { SdkQuery, SdkQueryFunction, SdkSpawnOptions } from './sdk-types.js'

/** 开一轮要的东西：SDK 的 query、模型名与覆盖到环境变量上的那几项。配置不对就在这一步抛错，不开这一轮 */
export interface PreparedRound {
  query: SdkQueryFunction
  model: string | undefined
  env: Record<string, string | undefined>
}

export interface RuntimeDeps {
  /** modelName 是会话记下的模型；新会话时是 create 收到的（undefined 交给调用方按 default-model 定） */
  prepareRound(modelName: string | null | undefined): Promise<{ modelName: string | null; round: PreparedRound }>
  readSessions(): Promise<unknown>
  writeSessions(value: unknown): Promise<void>
  error(message: string): void
  spawnClaudeCode(options: SdkSpawnOptions): ChildProcess
  /** 连同 Claude Code 开的命令一起结束；进程已经退出不算错 */
  endProcessTree(pid: number): Promise<void>
}

const INTERRUPTED_BY_RELOAD = '插件重载或工作台退出，这一轮被结束，没有交回结果；没有自动重试。'
const INTERRUPTED_BY_NEXT_ROUND = '被下一轮打断（send 带 interrupt），这一轮没有交回结果。'
const MAX_PROMPT_CHARS = 100000
const MAX_RESULT_CHARS = 16000
const MAX_PROGRESS_TEXT_CHARS = 600

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const sessionIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u
const workspaceKey = (workspace: string): string => path.resolve(workspace).toLowerCase()

function requireAbsoluteWorkspace(workspace: string): string {
  if (!path.isAbsolute(workspace)) throw new Error(`workspace 要是工作区目录的绝对路径，收到 ${workspace}`)
  return path.resolve(workspace)
}

function requireSessionId(sessionId: string): void {
  if (!sessionIdPattern.test(sessionId)) throw new Error(`sessionId 要是本插件 create 回执里的 UUID，收到 ${sessionId}`)
}

function requirePrompt(prompt: string): void {
  if (prompt.trim() === '' || prompt.length > MAX_PROMPT_CHARS) throw new Error(`prompt 要是 1~${MAX_PROMPT_CHARS} 字符的非空文本`)
}

/** 系统边界：会话记录从磁盘读回。上次没收尾的 running 按中断失败收尾 */
function loadSessions(value: unknown): ClaudeAgentSession[] {
  if (value === undefined) return []
  if (!isRecord(value) || value['version'] !== 1 || !Array.isArray(value['sessions'])) throw new Error('claude-agent 会话记录格式错误')
  return value['sessions'].map((item: unknown): ClaudeAgentSession => {
    if (
      !isRecord(item) || typeof item['sessionId'] !== 'string' || !sessionIdPattern.test(item['sessionId'])
      || typeof item['workspace'] !== 'string' || !path.isAbsolute(item['workspace'])
      || !(item['model'] === null || typeof item['model'] === 'string')
      || typeof item['round'] !== 'number' || !Number.isSafeInteger(item['round']) || item['round'] < 1
      || !['running', 'completed', 'failed'].includes(String(item['status'])) || typeof item['text'] !== 'string'
    ) throw new Error('claude-agent 会话记录格式错误')
    const unfinished = item['status'] === 'running'
    return {
      sessionId: item['sessionId'],
      workspace: item['workspace'],
      model: item['model'],
      round: item['round'],
      status: unfinished ? 'failed' : (item['status'] as 'completed' | 'failed'),
      text: unfinished ? INTERRUPTED_BY_RELOAD : item['text'],
    }
  })
}

/** SDK 的消息按 unknown 收：主代理（parent_tool_use_id 为 null）的文字与工具调用记进进度，子代理的不记 */
function recordProgress(progress: ClaudeAgentProgress, message: Record<string, unknown>): void {
  if (message['parent_tool_use_id'] !== null) return
  const content = isRecord(message['message']) ? message['message']['content'] : undefined
  if (!Array.isArray(content)) return
  for (const block of content) {
    if (!isRecord(block)) continue
    if (block['type'] === 'text' && typeof block['text'] === 'string' && block['text'].trim() !== '') progress.lastText = block['text'].slice(-MAX_PROGRESS_TEXT_CHARS)
    if (block['type'] === 'tool_use' && typeof block['name'] === 'string') {
      progress.toolCalls++
      progress.lastTool = block['name']
    }
  }
}

interface RoundOutcome {
  failed: boolean
  text: string
}

/** result 消息：成功带 result 文本；出错的 subtype 带 errors 数组 */
function outcomeOfResult(message: Record<string, unknown>): RoundOutcome {
  const failed = message['is_error'] === true || message['subtype'] !== 'success'
  if (typeof message['result'] === 'string') return { failed, text: message['result'].slice(-MAX_RESULT_CHARS) }
  const errors = Array.isArray(message['errors']) ? message['errors'].filter((one): one is string => typeof one === 'string') : []
  return { failed, text: (errors.length > 0 ? errors.join('\n') : `这一轮以 ${String(message['subtype'])} 结束，没有交回文本`).slice(-MAX_RESULT_CHARS) }
}

interface RunningRound {
  query: SdkQuery
  /** SDK 启动 Claude Code 后才有 pid */
  claudeCode: { pid: number | undefined }
  progress: ClaudeAgentProgress
  interruptedByNextRound: boolean
  finished: Promise<void>
  /** 收尾时这一轮的记录；waitRound 交回它，不受之后开的下一轮影响。存盘队列已经坏了时没有 */
  ended: ClaudeAgentSession | undefined
}

export class ClaudeAgentRuntime {
  private sessions: ClaudeAgentSession[] = []
  private queue: Promise<unknown>
  private storageError: unknown
  private closing = false
  private readonly runningRounds = new Map<string, RunningRound>()

  constructor(private readonly deps: RuntimeDeps) {
    this.queue = deps.readSessions().then((value) => { this.sessions = loadSessions(value) }).catch((error: unknown) => { this.storageError = error })
  }

  /** 会话表的读写排成一队，存盘失败后一律报那次的错 */
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => {
      if (this.storageError !== undefined) throw this.storageError
      return operation()
    })
    this.queue = next.catch(() => {})
    return next
  }

  private async save(): Promise<void> {
    try {
      await this.deps.writeSessions({ version: 1, sessions: structuredClone(this.sessions) })
    } catch (error) {
      this.storageError = error
      throw error
    }
  }

  private find(workspace: string, sessionId: string): ClaudeAgentSession {
    const session = this.sessions.find((one) => one.sessionId === sessionId && workspaceKey(one.workspace) === workspaceKey(workspace))
    if (session === undefined) throw new Error('不是本 home、这个工作区的 claude-agent 会话')
    return session
  }

  async create({ workspace, prompt, model }: ClaudeAgentCreateInput): Promise<ClaudeAgentStarted> {
    const resolvedWorkspace = requireAbsoluteWorkspace(workspace)
    requirePrompt(prompt)
    await this.requireDirectory(resolvedWorkspace)
    const { modelName, round } = await this.deps.prepareRound(model)
    const session = await this.serial(async () => {
      this.assertNotClosing()
      const created: ClaudeAgentSession = { sessionId: randomUUID(), workspace: resolvedWorkspace, model: modelName, round: 1, status: 'running', text: '' }
      this.sessions.push(created)
      await this.save()
      return created
    })
    this.startRound(session, round, prompt, false)
    return { sessionId: session.sessionId, round: session.round, model: session.model, accepted: true }
  }

  async send({ workspace, sessionId, prompt, interrupt }: ClaudeAgentSendInput): Promise<ClaudeAgentStarted> {
    requireSessionId(sessionId)
    const resolvedWorkspace = requireAbsoluteWorkspace(workspace)
    requirePrompt(prompt)
    const existing = await this.serial(async () => this.find(resolvedWorkspace, sessionId))
    const running = this.runningRounds.get(sessionId)
    if (running !== undefined) {
      if (interrupt !== true) throw new Error('这条会话的上一轮还在跑；要先打断它就带 interrupt: true')
      running.interruptedByNextRound = true
      try {
        await this.endRound(running)
      } catch (error) {
        running.interruptedByNextRound = false
        throw error
      }
    }
    const { round } = await this.deps.prepareRound(existing.model)
    const session = await this.serial(async () => {
      this.assertNotClosing()
      const current = this.find(resolvedWorkspace, sessionId)
      if (this.runningRounds.has(sessionId) || current.status === 'running') throw new Error('这条会话已经有一轮在跑（另一个 send 刚开始了它）')
      current.round++
      current.status = 'running'
      current.text = ''
      await this.save()
      return current
    })
    this.startRound(session, round, prompt, true)
    return { sessionId: session.sessionId, round: session.round, model: session.model, accepted: true }
  }

  async status({ workspace, sessionId }: ClaudeAgentSessionInput): Promise<ClaudeAgentStatus> {
    requireSessionId(sessionId)
    const resolvedWorkspace = requireAbsoluteWorkspace(workspace)
    return this.serial(async () => {
      const session = this.find(resolvedWorkspace, sessionId)
      const running = this.runningRounds.get(sessionId)
      return { ...structuredClone(session), progress: running === undefined ? null : structuredClone(running.progress) }
    })
  }

  async waitRound({ workspace, sessionId, round }: ClaudeAgentRoundInput): Promise<ClaudeAgentSession> {
    requireSessionId(sessionId)
    const resolvedWorkspace = requireAbsoluteWorkspace(workspace)
    if (!Number.isSafeInteger(round) || round < 1) throw new Error(`round 要是正整数，收到 ${String(round)}`)
    const { latest, running } = await this.serial(async () => ({ latest: structuredClone(this.find(resolvedWorkspace, sessionId)), running: this.runningRounds.get(sessionId) }))
    if (round !== latest.round) throw new Error(`这条会话最新的是第 ${latest.round} 轮，等不了第 ${round} 轮：只保存最新一轮的结果`)
    if (running === undefined) return latest
    await running.finished
    if (running.ended === undefined) throw new Error(`第 ${round} 轮结束了，但会话记录存盘已经坏了，结果没有记下`)
    return running.ended
  }

  private assertNotClosing(): void {
    if (this.closing) throw new Error('claude-agent 插件正在卸载')
  }

  private async requireDirectory(workspace: string): Promise<void> {
    if (!(await stat(workspace)).isDirectory()) throw new Error(`工作区 ${workspace} 不是目录`)
  }

  /** query() 一调用就开始跑；这里只登记，结果由 consumeRound 收 */
  private startRound(session: ClaudeAgentSession, prepared: PreparedRound, prompt: string, resume: boolean): void {
    const claudeCode: RunningRound['claudeCode'] = { pid: undefined }
    const spawnClaudeCodeProcess = (options: SdkSpawnOptions): ChildProcess => {
      const child = this.deps.spawnClaudeCode(options)
      claudeCode.pid = child.pid
      return child
    }
    const query = prepared.query({
      prompt,
      options: {
        cwd: session.workspace,
        ...(prepared.model === undefined ? {} : { model: prepared.model }),
        env: prepared.env,
        ...(resume ? { resume: session.sessionId } : { sessionId: session.sessionId }),
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        spawnClaudeCodeProcess,
      },
    })
    const running: RunningRound = { query, claudeCode, progress: { toolCalls: 0, lastTool: null, lastText: null }, interruptedByNextRound: false, finished: Promise.resolve(), ended: undefined }
    running.finished = this.consumeRound(session, running)
    this.runningRounds.set(session.sessionId, running)
  }

  private async consumeRound(session: ClaudeAgentSession, running: RunningRound): Promise<void> {
    let outcome: RoundOutcome | undefined
    try {
      for await (const message of running.query) {
        if (!isRecord(message)) continue
        if (message['type'] === 'assistant') recordProgress(running.progress, message)
        if (message['type'] === 'result') outcome = outcomeOfResult(message)
      }
    } catch (error) {
      outcome = { failed: true, text: String(error instanceof Error ? error.message : error).slice(-MAX_RESULT_CHARS) }
    }
    await this.serial(async () => {
      this.runningRounds.delete(session.sessionId)
      if (this.closing) {
        session.status = 'failed'
        session.text = INTERRUPTED_BY_RELOAD
      } else if (running.interruptedByNextRound) {
        session.status = 'failed'
        session.text = INTERRUPTED_BY_NEXT_ROUND
      } else if (outcome === undefined) {
        session.status = 'failed'
        session.text = '这一轮结束了却没有交回 result；没有自动重试。'
      } else {
        session.status = outcome.failed ? 'failed' : 'completed'
        session.text = outcome.text
      }
      running.ended = structuredClone(session)
      await this.save()
    }).catch(() => {
      this.runningRounds.delete(session.sessionId)
      this.deps.error('claude-agent 这一轮的结果存盘失败')
    })
  }

  /** 先结束进程树，再让 SDK 收尾；SDK 一侧的 close() 只结束 claude.exe 本身 */
  private async endRound(running: RunningRound): Promise<void> {
    if (running.claudeCode.pid !== undefined) await this.deps.endProcessTree(running.claudeCode.pid)
    running.query.close()
    await running.finished
  }

  async dispose(): Promise<void> {
    this.closing = true
    await this.queue
    const rounds = [...this.runningRounds.values()]
    const ended = await Promise.allSettled(rounds.map((round) => this.endRound(round)))
    for (const one of ended) if (one.status === 'rejected') this.deps.error(String(one.reason instanceof Error ? one.reason.message : one.reason))
    await Promise.allSettled(rounds.map((round) => round.finished))
    await this.queue
  }
}
