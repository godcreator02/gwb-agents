import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { ClaudecodeCreateInput, ClaudecodeSendInput, ClaudecodeSession, ClaudecodeSessionInput, ClaudecodeStarted } from './api.js'

export interface RuntimeDeps { executable(): string; read(): Promise<unknown>; write(value: unknown): Promise<void>; error(message: string): void }

/** 卸载时被结束、或上次工作台没正常退出留下的「进行中」，一律按失败收尾，不留状态不明 */
const INTERRUPTED_TEXT = '插件重载或工作台退出，这一轮的 Claude 进程被结束，没有交回结果；没有自动重试。'
const MAX_PROMPT_CHARS = 100000
const MAX_RESULT_CHARS = 16000

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u
const workspaceKey = (value: string): string => path.resolve(value).toLowerCase()

function requireAbsoluteWorkspace(workspace: string): string {
  if (!path.isAbsolute(workspace)) throw new Error(`workspace 要是工作区目录的绝对路径，收到 ${workspace}`)
  return path.resolve(workspace)
}

function requireSessionId(sessionId: string): void {
  if (!idPattern.test(sessionId)) throw new Error(`sessionId 要是本插件 create 回执里的 UUID，收到 ${sessionId}`)
}

function requirePrompt(prompt: string): void {
  if (prompt.trim() === '' || prompt.length > MAX_PROMPT_CHARS) throw new Error(`prompt 要是 1~${MAX_PROMPT_CHARS} 字符的非空文本`)
}

export function cliArgs(sessionId: string, resume: boolean): string[] {
  // 用户授权无人值守执行；新建与续聊使用相同权限模式，仍加载本机配置与纪律 hooks。
  return ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions', ...(resume ? ['--resume', sessionId] : ['--session-id', sessionId])]
}

/** 系统边界：会话记录从磁盘读回。旧版本写下的 running / unknown 都是上次没正常收尾的轮次，按中断失败收尾 */
function loadSessions(value: unknown): ClaudecodeSession[] {
  if (value === undefined) return []
  if (!record(value) || value.version !== 1 || !Array.isArray(value.sessions)) throw new Error('Claude 会话记录格式错误')
  return value.sessions.map((s: unknown): ClaudecodeSession => {
    if (!record(s) || typeof s.sessionId !== 'string' || !idPattern.test(s.sessionId) || typeof s.workspace !== 'string' || !path.isAbsolute(s.workspace) || typeof s.round !== 'number' || !Number.isSafeInteger(s.round) || s.round < 1 || !['running', 'completed', 'failed', 'unknown'].includes(String(s.status)) || typeof s.text !== 'string') throw new Error('Claude 会话记录格式错误')
    const unfinished = s.status === 'running' || s.status === 'unknown'
    return { sessionId: s.sessionId, workspace: s.workspace, round: s.round, status: unfinished ? 'failed' : (s.status as 'completed' | 'failed'), text: unfinished ? INTERRUPTED_TEXT : s.text }
  })
}

export class ClaudeRuntime {
  private sessions: ClaudecodeSession[] = []
  private queue: Promise<unknown>
  private storageError: unknown
  private closing = false
  private readonly children = new Map<string, ChildProcessWithoutNullStreams>()
  private readonly exits = new Set<Promise<void>>()
  private readonly sessionExits = new Map<string, Promise<void>>()

  constructor(private readonly deps: RuntimeDeps) {
    this.queue = deps.read().then((value) => { this.sessions = loadSessions(value) }).catch((error: unknown) => { this.storageError = error })
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => { if (this.storageError !== undefined) throw this.storageError; return fn() })
    this.queue = next.catch(() => {}); return next
  }

  private async save(): Promise<void> {
    try { await this.deps.write({ version: 1, sessions: structuredClone(this.sessions) }) }
    catch (error) { this.storageError = error; throw error }
  }

  private find(workspace: string, id: string): ClaudecodeSession {
    const session = this.sessions.find((s) => s.sessionId === id && workspaceKey(s.workspace) === workspaceKey(workspace))
    if (session === undefined) throw new Error('不是本 home、这个工作区的 Claude 会话')
    return session
  }

  async create({ workspace, prompt }: ClaudecodeCreateInput): Promise<ClaudecodeStarted> {
    return this.start(requireAbsoluteWorkspace(workspace), null, prompt)
  }

  async send({ workspace, sessionId, prompt }: ClaudecodeSendInput): Promise<ClaudecodeStarted> {
    requireSessionId(sessionId)
    await this.sessionExits.get(sessionId)
    return this.start(requireAbsoluteWorkspace(workspace), sessionId, prompt)
  }

  async status({ workspace, sessionId }: ClaudecodeSessionInput): Promise<ClaudecodeSession> {
    requireSessionId(sessionId)
    const resolved = requireAbsoluteWorkspace(workspace)
    return this.serial(async () => structuredClone(this.find(resolved, sessionId)))
  }

  private async start(workspace: string, resumeId: string | null, prompt: string): Promise<ClaudecodeStarted> {
    requirePrompt(prompt)
    if (!(await stat(workspace)).isDirectory()) throw new Error('工作区不是目录')
    const executable = this.deps.executable()
    if (!path.isAbsolute(executable) || !executable.toLowerCase().endsWith('.exe') || !(await stat(executable)).isFile()) throw new Error('请配置本机 Claude Code 原生 exe 绝对路径')
    const session = await this.serial(async () => {
      if (this.closing) throw new Error('Claude 插件正在卸载')
      const current: ClaudecodeSession = resumeId === null ? { sessionId: randomUUID(), workspace, round: 0, status: 'completed', text: '' } : this.find(workspace, resumeId)
      if (this.children.has(current.sessionId) || current.status === 'running') throw new Error('这条会话的上一轮仍在执行，不能续发')
      if (resumeId === null) this.sessions.push(current)
      current.round++; current.status = 'running'; current.text = ''; await this.save(); return current
    })
    let buffer = '', resultText: string | null = null, resultFailed = false
    const child = spawn(executable, cliArgs(session.sessionId, resumeId !== null), { cwd: workspace, windowsHide: true, shell: false, stdio: 'pipe' })
    this.children.set(session.sessionId, child)
    // 不保存提示词、工具事件或 stderr。
    child.stderr.resume(); child.stdin.on('error', () => {}); child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
        try {
          const message: unknown = JSON.parse(line)
          if (record(message) && message.type === 'result' && message.session_id === session.sessionId) {
            resultFailed = message.is_error === true
            resultText = (typeof message.result === 'string' ? message.result : '执行端未返回文本结果').slice(-MAX_RESULT_CHARS)
          }
        } catch { /* 只认 CLI 的 NDJSON result，不解析进度行。 */ }
      }
      if (buffer.length > 2_000_000) { buffer = ''; resultFailed = true; child.kill() }
    })
    const exit = new Promise<void>((resolve) => {
      child.once('close', (code) => {
        this.children.delete(session.sessionId)
        void this.serial(async () => {
          if (this.closing) { session.status = 'failed'; session.text = INTERRUPTED_TEXT }
          else {
            session.status = code === 0 && resultText !== null && !resultFailed ? 'completed' : 'failed'
            session.text = resultText ?? 'Claude 进程未交回结果，请核对本机登录、工具权限与会话；没有自动重试。'
          }
          await this.save()
        }).catch(() => this.deps.error('Claude 进程结果保存失败')).finally(resolve)
      })
    }).finally(() => { this.exits.delete(exit); this.sessionExits.delete(session.sessionId) })
    this.exits.add(exit)
    this.sessionExits.set(session.sessionId, exit)
    await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', () => reject(new Error('Claude 原生进程启动失败；请核对 executable 配置'))) })
    child.stdin.end(prompt)
    return { sessionId: session.sessionId, round: session.round, accepted: true }
  }

  async dispose(): Promise<void> {
    this.closing = true; await this.queue
    for (const child of this.children.values()) child.kill()
    await Promise.allSettled([...this.exits]); await this.queue
  }
}
