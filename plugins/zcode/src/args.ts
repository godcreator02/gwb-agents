import path from 'node:path'

/** 三条命令的参数校验：认不出的键直接报错，不静默忽略 */

/** MCP 客户端等一次调用有上限（Claude Code 是 300 秒没动静就放弃），zcode.status 的等待留出余量 */
export const MAX_WAIT_SECONDS = 240

export interface CreateArgs {
  workspace: string
  prompt: string
}

export interface SendArgs extends CreateArgs {
  task: string
}

export interface StatusArgs {
  workspace: string
  task: string
  waitSeconds: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function objectArgs(commandName: string, raw: unknown, allowedKeys: string[]): Record<string, unknown> {
  if (!isRecord(raw)) throw new Error(`${commandName} 的参数要是对象，含 ${allowedKeys.join('、')}`)
  const unknownKeys = Object.keys(raw).filter((key) => !allowedKeys.includes(key))
  if (unknownKeys.length > 0) {
    throw new Error(`${commandName} 不认识参数 ${unknownKeys.join('、')}，只收 ${allowedKeys.join('、')}`)
  }
  return raw
}

function requireNonEmptyString(commandName: string, key: string, value: unknown, meaning: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${commandName} 缺 ${key}：${meaning}`)
  return value
}

function workspacePath(commandName: string, value: unknown): string {
  const workspace = requireNonEmptyString(commandName, 'workspace', value, '工作区目录的绝对路径')
  if (!path.win32.isAbsolute(workspace)) throw new Error(`${commandName} 的 workspace 要是绝对路径，收到 ${workspace}`)
  return workspace
}

const TASK_MEANING = 'zcode.create 回执里的 taskId（sess_ 开头）'

export function parseCreateArgs(raw: unknown): CreateArgs {
  const commandName = 'zcode.create'
  const obj = objectArgs(commandName, raw, ['workspace', 'prompt'])
  return {
    workspace: workspacePath(commandName, obj['workspace']),
    prompt: requireNonEmptyString(commandName, 'prompt', obj['prompt'], '发给 ZCode 的任务说明'),
  }
}

export function parseSendArgs(raw: unknown): SendArgs {
  const commandName = 'zcode.send'
  const obj = objectArgs(commandName, raw, ['workspace', 'task', 'prompt'])
  return {
    workspace: workspacePath(commandName, obj['workspace']),
    task: requireNonEmptyString(commandName, 'task', obj['task'], TASK_MEANING),
    prompt: requireNonEmptyString(commandName, 'prompt', obj['prompt'], '发给 ZCode 的指令'),
  }
}

export function parseStatusArgs(raw: unknown): StatusArgs {
  const commandName = 'zcode.status'
  const obj = objectArgs(commandName, raw, ['workspace', 'task', 'waitSeconds'])
  const waitSeconds = obj['waitSeconds'] ?? 0
  if (typeof waitSeconds !== 'number' || !Number.isFinite(waitSeconds) || waitSeconds < 0 || waitSeconds > MAX_WAIT_SECONDS) {
    throw new Error(`${commandName} 的 waitSeconds 要是 0 到 ${MAX_WAIT_SECONDS} 之间的数（秒），收到 ${JSON.stringify(obj['waitSeconds'])}`)
  }
  return {
    workspace: workspacePath(commandName, obj['workspace']),
    task: requireNonEmptyString(commandName, 'task', obj['task'], TASK_MEANING),
    waitSeconds,
  }
}
