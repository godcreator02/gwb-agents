import type { ZcodeCreateInput, ZcodeSendInput, ZcodeStatusInput, ZcodeTaskInput, ZcodeWorkspaceInput } from './api.js'

/** 命令参数的形状校验：认不出的键直接报错，不静默忽略；取值的含义（绝对路径、等待上限）由服务方法自己查 */

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

function optionalNumber(commandName: string, key: string, value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number') throw new Error(`${commandName} 的 ${key} 要是数，收到 ${JSON.stringify(value)}`)
  return value
}

function optionalBoolean(commandName: string, key: string, value: unknown): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`${commandName} 的 ${key} 要是 true 或 false，收到 ${JSON.stringify(value)}`)
  return value
}

const WORKSPACE_MEANING = '工作区目录的绝对路径'
const TASK_MEANING = 'zcode.create 回执里的 taskId（sess_ 开头）'

export function parseOpenArgs(raw: unknown): ZcodeWorkspaceInput {
  const commandName = 'zcode.open'
  const obj = objectArgs(commandName, raw, ['workspace'])
  return { workspace: requireNonEmptyString(commandName, 'workspace', obj['workspace'], WORKSPACE_MEANING) }
}

export function parseCreateArgs(raw: unknown): ZcodeCreateInput {
  const commandName = 'zcode.create'
  const obj = objectArgs(commandName, raw, ['workspace', 'prompt'])
  return {
    workspace: requireNonEmptyString(commandName, 'workspace', obj['workspace'], WORKSPACE_MEANING),
    prompt: requireNonEmptyString(commandName, 'prompt', obj['prompt'], '发给 ZCode 的任务说明'),
  }
}

export function parseSendArgs(raw: unknown): ZcodeSendInput {
  const commandName = 'zcode.send'
  const obj = objectArgs(commandName, raw, ['workspace', 'task', 'prompt', 'interrupt'])
  const interrupt = optionalBoolean(commandName, 'interrupt', obj['interrupt'])
  return {
    workspace: requireNonEmptyString(commandName, 'workspace', obj['workspace'], WORKSPACE_MEANING),
    task: requireNonEmptyString(commandName, 'task', obj['task'], TASK_MEANING),
    prompt: requireNonEmptyString(commandName, 'prompt', obj['prompt'], '发给 ZCode 的指令'),
    ...(interrupt === undefined ? {} : { interrupt }),
  }
}

export function parseStatusArgs(raw: unknown): ZcodeStatusInput {
  const commandName = 'zcode.status'
  const obj = objectArgs(commandName, raw, ['workspace', 'task', 'waitSeconds', 'replyTailChars'])
  const waitSeconds = optionalNumber(commandName, 'waitSeconds', obj['waitSeconds'])
  const replyTailChars = optionalNumber(commandName, 'replyTailChars', obj['replyTailChars'])
  return {
    workspace: requireNonEmptyString(commandName, 'workspace', obj['workspace'], WORKSPACE_MEANING),
    task: requireNonEmptyString(commandName, 'task', obj['task'], TASK_MEANING),
    ...(waitSeconds === undefined ? {} : { waitSeconds }),
    ...(replyTailChars === undefined ? {} : { replyTailChars }),
  }
}

export function parseArchiveArgs(raw: unknown): ZcodeTaskInput {
  const commandName = 'zcode.archive'
  const obj = objectArgs(commandName, raw, ['workspace', 'task'])
  return {
    workspace: requireNonEmptyString(commandName, 'workspace', obj['workspace'], WORKSPACE_MEANING),
    task: requireNonEmptyString(commandName, 'task', obj['task'], TASK_MEANING),
  }
}
