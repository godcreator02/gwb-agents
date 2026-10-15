// 用法：node --env-file=<含 DEEPSEEK_API_KEY / GLM_API_KEY 的文件> probe.mjs <SDK 包目录> [--keep-session-env]
// 不换 CLAUDE_CONFIG_DIR、照常加载本机设置时，token 用哪个环境变量传才不会被本机 Claude 登录盖掉。
// 默认去掉 Claude Code 桌面版给它启动的进程塞的会话变量（模拟从开始菜单启动的工作台）；--keep-session-env 保留它们
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const sdkDir = process.argv[2]
if (!sdkDir) throw new Error('给 SDK 包目录')
const keepSessionEnv = process.argv.includes('--keep-session-env')

/** 用户级环境变量里本来就有的两项留着，其余 CLAUDE* / ANTHROPIC* / *_OAUTH 都是桌面版会话塞进来的 */
const userLevelClaudeVariables = new Set(['CLAUDE_CODE_PLUGIN_DIRS', 'CLAUDE_CODE_USE_POWERSHELL_TOOL'])
const isDesktopSessionVariable = (name) => /^(CLAUDE|ANTHROPIC|USE_(LOCAL|STAGING)_OAUTH)/u.test(name) && !userLevelClaudeVariables.has(name)
const { query } = await import(pathToFileURL(join(sdkDir, 'sdk.mjs')).href)

const providers = [
  { name: 'deepseek', baseUrl: 'https://api.deepseek.com/anthropic', token: process.env.DEEPSEEK_API_KEY, model: 'deepseek-flash' },
  { name: 'glm', baseUrl: 'https://open.bigmodel.cn/api/anthropic', token: process.env.GLM_API_KEY, model: 'glm-5.3' },
]
const tokenVariables = ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY']

const { CLAUDE_CODE_PLUGIN_DIRS, DEEPSEEK_API_KEY, GLM_API_KEY, ...rest } = process.env
const inherited = Object.fromEntries(Object.entries(rest).filter(([name]) => keepSessionEnv || !isDesktopSessionVariable(name)))
console.log(`会话变量：${keepSessionEnv ? '保留' : '去掉'}`)
for (const provider of providers) {
  if (!provider.token) throw new Error(`缺 ${provider.name} 的 key`)
  for (const tokenVariable of tokenVariables) {
    const env = {
      ...inherited,
      ANTHROPIC_BASE_URL: provider.baseUrl,
      [tokenVariable]: provider.token,
      ANTHROPIC_DEFAULT_OPUS_MODEL: provider.model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: provider.model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: provider.model,
    }
    let outcome = '没有 result'
    let initModel = '?'
    try {
      // 不给 settingSources：和插件一样加载本机的用户、项目、本地设置
      for await (const message of query({ prompt: '只回答两个字母：ok', options: { cwd: process.cwd(), env, model: provider.model, tools: [], maxTurns: 1 } })) {
        if (message.type === 'system' && message.subtype === 'init') initModel = message.model
        if (message.type === 'result') outcome = `${message.subtype} is_error=${message.is_error} ${JSON.stringify(message.result).slice(0, 160)}`
      }
    } catch (error) {
      outcome = `抛错：${String(error).split('\n')[0].slice(0, 200)}`
    }
    console.log(`${provider.name} | ${tokenVariable} | init model=${initModel} | ${outcome}`)
  }
}
