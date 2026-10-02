import path from 'node:path'

/** 两条命令的参数校验：认不出的键直接报错，不静默忽略 */

export const DEFAULT_TIMEOUT_SECONDS = 1800

export interface CreateArgs {
  workspace: string
  prompt: string
  timeoutSeconds: number
}

export interface SendArgs extends CreateArgs {
  task: string
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

function timeoutSeconds(commandName: string, value: unknown): number {
  if (value === undefined) return DEFAULT_TIMEOUT_SECONDS
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${commandName} 的 timeoutSeconds 要是正数（秒），收到 ${JSON.stringify(value)}`)
  }
  return value
}

export function parseCreateArgs(raw: unknown): CreateArgs {
  const commandName = 'zcode.create'
  const obj = objectArgs(commandName, raw, ['workspace', 'prompt', 'timeoutSeconds'])
  return {
    workspace: workspacePath(commandName, obj['workspace']),
    prompt: requireNonEmptyString(commandName, 'prompt', obj['prompt'], '发给 ZCode 的任务说明'),
    timeoutSeconds: timeoutSeconds(commandName, obj['timeoutSeconds']),
  }
}

export function parseSendArgs(raw: unknown): SendArgs {
  const commandName = 'zcode.send'
  const obj = objectArgs(commandName, raw, ['workspace', 'task', 'prompt', 'timeoutSeconds'])
  return {
    workspace: workspacePath(commandName, obj['workspace']),
    task: requireNonEmptyString(commandName, 'task', obj['task'], 'zcode.create 回执里的 taskId（sess_ 开头）'),
    prompt: requireNonEmptyString(commandName, 'prompt', obj['prompt'], '发给 ZCode 的指令'),
    timeoutSeconds: timeoutSeconds(commandName, obj['timeoutSeconds']),
  }
}
