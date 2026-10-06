import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'

export interface Session { sessionId: string; workspace: string; round: number; status: 'running' | 'completed' | 'failed' | 'unknown'; text: string }
export interface RuntimeDeps { executable(): string; read(): Promise<unknown>; write(value: unknown): Promise<void>; error(message: string): void }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u
const workspaceKey = (value: string): string => path.resolve(value).toLowerCase()
export function parseArgs(raw: unknown, kind: 'create' | 'send' | 'status' | 'resolve'): { workspace: string; sessionId?: string; prompt?: string } {
  const allowed = ['workspace', ...(kind === 'create' ? [] : ['sessionId']), ...(['create', 'send'].includes(kind) ? ['prompt'] : []), ...(kind === 'resolve' ? ['confirmedStopped'] : [])]
  if (!record(raw) || Object.keys(raw).some((key) => !allowed.includes(key)) || typeof raw.workspace !== 'string' || !path.isAbsolute(raw.workspace)) throw new Error('workspace 必须是绝对路径；不接受未声明参数')
  if (kind !== 'create' && (typeof raw.sessionId !== 'string' || !idPattern.test(raw.sessionId))) throw new Error('sessionId 必须是本插件创建的 UUID')
  if (['create', 'send'].includes(kind) && (typeof raw.prompt !== 'string' || raw.prompt.trim() === '' || raw.prompt.length > 100000)) throw new Error('prompt 必须是1~100000字符')
  if (kind === 'resolve' && raw.confirmedStopped !== true) throw new Error('需核对原会话停止后传 confirmedStopped:true')
  return { workspace: path.resolve(raw.workspace), ...(typeof raw.sessionId === 'string' ? { sessionId: raw.sessionId } : {}), ...(typeof raw.prompt === 'string' ? { prompt: raw.prompt } : {}) }
}
export function cliArgs(sessionId: string, resume: boolean): string[] {
  // 用户授权无人值守执行；新建与续聊使用相同权限模式，仍加载本机配置与纪律 hooks。
  return ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions', ...(resume ? ['--resume', sessionId] : ['--session-id', sessionId])]
}
export class ClaudeRuntime {
  private sessions: Session[] = []
  private queue: Promise<unknown>
  private storageError: unknown
  private closing = false
  private readonly children = new Map<string, ChildProcessWithoutNullStreams>()
  private readonly exits = new Set<Promise<void>>()
  private readonly sessionExits = new Map<string, Promise<void>>()
  constructor(private readonly deps: RuntimeDeps) {
    this.queue = deps.read().then((value) => {
      if (value === undefined) return
      if (!record(value) || value.version !== 1 || !Array.isArray(value.sessions)) throw new Error('Claude 会话记录格式错误')
      this.sessions = value.sessions.map((s: unknown) => {
        if (!record(s) || typeof s.sessionId !== 'string' || !idPattern.test(s.sessionId) || typeof s.workspace !== 'string' || !path.isAbsolute(s.workspace) || typeof s.round !== 'number' || !Number.isSafeInteger(s.round) || s.round < 1 || !['running', 'completed', 'failed', 'unknown'].includes(String(s.status)) || typeof s.text !== 'string') throw new Error('Claude 会话记录格式错误')
        return { ...s, status: s.status === 'running' ? 'unknown' : s.status } as unknown as Session
      })
    }).catch((error: unknown) => { this.storageError = error })
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => { if (this.storageError !== undefined) throw this.storageError; return fn() })
    this.queue = next.catch(() => {}); return next
  }
  private async save(): Promise<void> {
    try { await this.deps.write({ version: 1, sessions: structuredClone(this.sessions) }) }
    catch (error) { this.storageError = error; throw error }
  }
  private find(workspace: string, id: string): Session {
    const session = this.sessions.find((s) => s.sessionId === id && workspaceKey(s.workspace) === workspaceKey(workspace))
    if (session === undefined) throw new Error('不是本 home、当前工作区的 Claude 会话')
    return session
  }
  async submit(raw: unknown, resume: boolean): Promise<{ sessionId: string; round: number; accepted: true }> {
    const args = parseArgs(raw, resume ? 'send' : 'create')
    if (resume) await this.sessionExits.get(args.sessionId!)
    if (!(await stat(args.workspace)).isDirectory()) throw new Error('工作区不是目录')
    const executable = this.deps.executable()
    if (!path.isAbsolute(executable) || !executable.toLowerCase().endsWith('.exe') || !(await stat(executable)).isFile()) throw new Error('请配置本机 Claude Code 原生 exe 绝对路径')
    const session = await this.serial(async () => {
      if (this.closing) throw new Error('Claude 插件正在卸载')
      const current: Session = resume ? this.find(args.workspace, args.sessionId!) : { sessionId: randomUUID(), workspace: args.workspace, round: 0, status: 'completed', text: '' }
      if (this.children.has(current.sessionId) || current.status === 'running' || current.status === 'unknown') throw new Error('上一轮仍执行中或状态不明，不能续发')
      if (!resume) this.sessions.push(current)
      current.round++; current.status = 'running'; current.text = ''; await this.save(); return current
    })
    let buffer = '', resultText: string | null = null, resultFailed = false
    const child = spawn(executable, cliArgs(session.sessionId, resume), { cwd: args.workspace, windowsHide: true, shell: false, stdio: 'pipe' })
    this.children.set(session.sessionId, child)
    // 不保存提示词、工具事件或 stderr，其中可能含应用回报凭证。
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
            resultText = (typeof message.result === 'string' ? message.result : '执行端未返回文本结果').replace(/[a-f0-9]{64}/gu, '[凭证已隐藏]').slice(-16000)
          }
        } catch { /* 只认 CLI 的 NDJSON result，不解析进度行。 */ }
      }
      if (buffer.length > 2_000_000) { buffer = ''; resultFailed = true; child.kill() }
    })
    const exit = new Promise<void>((resolve) => {
      child.once('close', (code) => {
        this.children.delete(session.sessionId)
        void this.serial(async () => {
          session.status = this.closing ? 'unknown' : code === 0 && resultText !== null && !resultFailed ? 'completed' : 'failed'
          session.text = resultText ?? 'Claude 进程未交回结果，请核对本机登录、工具权限与会话；没有自动重试。'
          await this.save()
        }).catch(() => this.deps.error('Claude 进程结果保存失败')).finally(resolve)
      })
    }).finally(() => { this.exits.delete(exit); this.sessionExits.delete(session.sessionId) })
    this.exits.add(exit)
    this.sessionExits.set(session.sessionId, exit)
    await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', () => reject(new Error('Claude 原生进程启动失败；请核对 executable 配置'))) })
    child.stdin.end(args.prompt)
    return { sessionId: session.sessionId, round: session.round, accepted: true }
  }
  async status(raw: unknown): Promise<Session> {
    const args = parseArgs(raw, 'status'); return this.serial(async () => structuredClone(this.find(args.workspace, args.sessionId!)))
  }
  async resolve(raw: unknown): Promise<Session> {
    const args = parseArgs(raw, 'resolve')
    return this.serial(async () => {
      const session = this.find(args.workspace, args.sessionId!)
      if (this.children.has(session.sessionId) || session.status !== 'unknown') throw new Error('只能人工确认重载后的状态不明会话')
      session.status = 'failed'; session.text = '已人工确认原会话停止'; await this.save(); return structuredClone(session)
    })
  }
  async dispose(): Promise<void> {
    this.closing = true; await this.queue
    for (const child of this.children.values()) child.kill()
    await Promise.allSettled([...this.exits]); await this.queue
  }
}
