import type { SettingGroupDef, SettingGroupInstance } from '@godcreator/gwb-settings'

/** 设置里的一组模型配置：每份实例有模型名、请求地址、token */
export const MODELS_GROUP = 'models'

export const MODEL_FIELDS: SettingGroupDef['fields'] = [
  { key: 'model', title: '模型名', type: 'string', description: '传给 SDK 的模型名，如 claude-sonnet-5-5、deepseek-v4-pro、glm-5.3' },
  { key: 'base-url', title: '请求地址', type: 'string', description: 'Anthropic 兼容接口的地址，如 https://api.deepseek.com/anthropic；空着就用本机已登录的 Claude' },
  { key: 'token', title: 'token', type: 'secret', description: '填了请求地址才用，作为 ANTHROPIC_AUTH_TOKEN 发出' },
]

/** 一份模型配置读出来的样子；problem 不为 null 时这份不能用 */
export interface ModelEntry {
  name: string
  model: string | null
  baseUrl: string | null
  token: string | null
  tokenSet: boolean
  problem: string | null
}

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

function problemOf(model: string | null, baseUrl: string | null, tokenSet: boolean): string | null {
  if (model === null) return '没填模型名'
  if (baseUrl === null) return tokenSet ? '填了 token 却没填请求地址；本机 Claude 不用 token，第三方模型两项都要填' : null
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return `请求地址 ${baseUrl} 不是网址`
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return `请求地址 ${baseUrl} 要是 http 或 https`
  return tokenSet ? null : '填了请求地址却没填 token'
}

/** 系统边界：模型配置是人填的。逐份检查，不对的那份记下原因，用到它时报错 */
export function readModelEntries(instances: readonly SettingGroupInstance[]): ModelEntry[] {
  return instances.map(({ name, values }) => {
    const model = textOrNull(values['model'])
    const baseUrl = textOrNull(values['base-url'])
    const token = textOrNull(values['token'])
    return { name, model, baseUrl, token, tokenSet: token !== null, problem: problemOf(model, baseUrl, token !== null) }
  })
}

function usableEntry(entries: readonly ModelEntry[], name: string, source: string): ModelEntry {
  const entry = entries.find((one) => one.name === name)
  if (entry === undefined) {
    const names = entries.map((one) => one.name)
    throw new Error(`${source}「${name}」不在设置的模型配置里；现有：${names.length > 0 ? names.join('、') : '一份都没有'}`)
  }
  if (entry.problem !== null) throw new Error(`模型配置「${name}」不能用：${entry.problem}`)
  return entry
}

/** default-model 填了却用不了时的原因，给 setup-status；没填或能用回 null */
export function describeDefaultModel(entries: readonly ModelEntry[], defaultName: string | null): string | null {
  if (defaultName === null) return null
  try {
    usableEntry(entries, defaultName, '默认模型')
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/**
 * Claude Code 桌面版给它启动的进程塞了一批会话变量（如 CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH），
 * 子进程带着它们就改用桌面版的登录、盖掉第三方模型的 token（probes/2610152150_third-party-auth）。
 * 工作台可能由 Claude Code 会话启动，所以这一类名字只传用户自己长期设的（Windows 用户级、系统级环境变量里有的，
 * 如 CLAUDE_CODE_USE_POWERSHELL_TOOL，去掉它子会话就没有 Shell 工具）；~/.claude/settings.json 的 env 由子进程自己读
 */
const isClaudeVariable = (name: string): boolean => /^(CLAUDECODE$|CLAUDE_|ANTHROPIC_|USE_(LOCAL|STAGING)_OAUTH$)/iu.test(name)

export function inheritedEnvironment(
  processEnv: Readonly<Record<string, string | undefined>>,
  persistentVariableNames: ReadonlySet<string>,
): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(processEnv).filter(([name]) => !isClaudeVariable(name) || persistentVariableNames.has(name.toUpperCase())))
}

export interface PreparedModel {
  /** 记进会话的模型配置名；null 是本机已登录的 Claude、Claude Code 的默认模型 */
  modelName: string | null
  model: string | undefined
  env: Record<string, string | undefined>
}

/**
 * requested：undefined 是新会话没指定（用 default-model，那也空着就是本机 Claude）；null 是会话记着用本机 Claude；字符串是配置名
 */
export function prepareModel(
  entries: readonly ModelEntry[],
  requested: string | null | undefined,
  defaultName: string | null,
  processEnv: Readonly<Record<string, string | undefined>>,
  persistentVariableNames: ReadonlySet<string>,
): PreparedModel {
  const env = inheritedEnvironment(processEnv, persistentVariableNames)
  const name = requested === undefined ? defaultName : requested
  if (name === null) return { modelName: null, model: undefined, env }
  const entry = usableEntry(entries, name, requested === undefined ? '默认模型' : '模型')
  const model = entry.model!
  if (entry.baseUrl === null) return { modelName: entry.name, model, env }
  return {
    modelName: entry.name,
    model,
    env: {
      ...env,
      ANTHROPIC_BASE_URL: entry.baseUrl,
      ANTHROPIC_AUTH_TOKEN: entry.token!,
      // 后台小任务、子代理按档位选模型；三档都指到这个模型，免得请求到对方没有的 claude-* 名字
      ANTHROPIC_DEFAULT_OPUS_MODEL: model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
      CLAUDE_CODE_SUBAGENT_MODEL: model,
    },
  }
}
