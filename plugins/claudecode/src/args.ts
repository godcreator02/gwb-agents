import type { ClaudecodeCreateInput, ClaudecodeSendInput, ClaudecodeSessionInput } from './api.js'

/** claudecode.* 命令参数的形状校验：认不出的键直接报错；取值的含义（绝对路径、UUID、长度）由服务方法查 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function objectArgs(commandName: string, raw: unknown, allowedKeys: string[]): Record<string, unknown> {
  if (!isRecord(raw)) throw new Error(`${commandName} 的参数要是对象，含 ${allowedKeys.join('、')}`)
  const unknownKeys = Object.keys(raw).filter((key) => !allowedKeys.includes(key))
  if (unknownKeys.length > 0) throw new Error(`${commandName} 不认识参数 ${unknownKeys.join('、')}，只收 ${allowedKeys.join('、')}`)
  return raw
}

function requireString(commandName: string, key: string, value: unknown): string {
  if (typeof value !== 'string') throw new Error(`${commandName} 缺 ${key}（字符串）`)
  return value
}

export function parseCreateArgs(raw: unknown): ClaudecodeCreateInput {
  const obj = objectArgs('claudecode.create', raw, ['workspace', 'prompt'])
  return { workspace: requireString('claudecode.create', 'workspace', obj['workspace']), prompt: requireString('claudecode.create', 'prompt', obj['prompt']) }
}

export function parseSendArgs(raw: unknown): ClaudecodeSendInput {
  const obj = objectArgs('claudecode.send', raw, ['workspace', 'sessionId', 'prompt'])
  return {
    workspace: requireString('claudecode.send', 'workspace', obj['workspace']),
    sessionId: requireString('claudecode.send', 'sessionId', obj['sessionId']),
    prompt: requireString('claudecode.send', 'prompt', obj['prompt']),
  }
}

export function parseStatusArgs(raw: unknown): ClaudecodeSessionInput {
  const obj = objectArgs('claudecode.status', raw, ['workspace', 'sessionId'])
  return { workspace: requireString('claudecode.status', 'workspace', obj['workspace']), sessionId: requireString('claudecode.status', 'sessionId', obj['sessionId']) }
}
