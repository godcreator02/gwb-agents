import type { ClaudeAgentCreateInput, ClaudeAgentSendInput, ClaudeAgentSessionInput } from './api.js'

/** claude-agent.* 命令参数的形状校验：认不出的键直接报错；取值的含义（绝对路径、UUID、长度、模型名）由服务方法查 */

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

function optionalString(commandName: string, key: string, value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${commandName} 的 ${key} 要是字符串`)
  return value
}

function optionalBoolean(commandName: string, key: string, value: unknown): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`${commandName} 的 ${key} 要是 true 或 false`)
  return value
}

export function parseCreateArgs(raw: unknown): ClaudeAgentCreateInput {
  const command = 'claude-agent.create'
  const obj = objectArgs(command, raw, ['workspace', 'prompt', 'model'])
  const model = optionalString(command, 'model', obj['model'])
  return {
    workspace: requireString(command, 'workspace', obj['workspace']),
    prompt: requireString(command, 'prompt', obj['prompt']),
    ...(model === undefined ? {} : { model }),
  }
}

export function parseSendArgs(raw: unknown): ClaudeAgentSendInput {
  const command = 'claude-agent.send'
  const obj = objectArgs(command, raw, ['workspace', 'sessionId', 'prompt', 'interrupt'])
  const interrupt = optionalBoolean(command, 'interrupt', obj['interrupt'])
  return {
    workspace: requireString(command, 'workspace', obj['workspace']),
    sessionId: requireString(command, 'sessionId', obj['sessionId']),
    prompt: requireString(command, 'prompt', obj['prompt']),
    ...(interrupt === undefined ? {} : { interrupt }),
  }
}

export function parseStatusArgs(raw: unknown): ClaudeAgentSessionInput {
  const command = 'claude-agent.status'
  const obj = objectArgs(command, raw, ['workspace', 'sessionId'])
  return { workspace: requireString(command, 'workspace', obj['workspace']), sessionId: requireString(command, 'sessionId', obj['sessionId']) }
}

export function parseSetupStatusArgs(raw: unknown): void {
  if (raw === undefined || raw === null) return
  objectArgs('claude-agent.setup-status', raw, [])
}
