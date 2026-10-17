// 每个模型一份：model 传给 SDK，env 覆盖到子进程的环境变量上。
// 密钥与模型名从 api.txt 读（已 gitignore，格式见 api.txt.example，用 --env-file 载入）。
import { join } from 'node:path'
import { workRoot } from './paths.mjs'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`缺环境变量 ${name}：在 api.txt 里填上`)
  return value
}

// Claude Code 后台小任务、子代理按档位选模型，三个档位都指到同一个模型，免得请求到对方没有的 claude-* 名字。
// 本机已登录的 Claude 账号凭据会盖过 ANTHROPIC_AUTH_TOKEN（实测 401，发出去的是登录凭据），
// 所以第三方模型用一个空的配置目录，让子进程读不到它。
function thirdPartyProfile({ name, baseUrl, tokenVar, modelVar }) {
  const model = requireEnv(modelVar)
  return {
    model,
    env: {
      CLAUDE_CONFIG_DIR: join(workRoot, `.claude-config-${name}`),
      ANTHROPIC_BASE_URL: baseUrl,
      ANTHROPIC_AUTH_TOKEN: requireEnv(tokenVar),
      ANTHROPIC_DEFAULT_OPUS_MODEL: model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
      CLAUDE_CODE_SUBAGENT_MODEL: model,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    },
  }
}

export const profiles = {
  claude: () => ({
    model: 'claude-sonnet-5-5',
    env: {},
  }),
  deepseek: () => thirdPartyProfile({
    name: 'deepseek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    tokenVar: 'DEEPSEEK_API_KEY',
    modelVar: 'DEEPSEEK_MODEL',
  }),
  glm: () => thirdPartyProfile({
    name: 'glm',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    tokenVar: 'GLM_API_KEY',
    modelVar: 'GLM_MODEL',
  }),
}
