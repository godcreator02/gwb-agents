import { describe, expect, it } from 'vitest'
import { describeDefaultModel, inheritedEnvironment, prepareModel, readModelEntries } from '../src/models.js'

const entries = readModelEntries([
  { name: 'sonnet', values: { model: 'claude-sonnet-5-5', 'base-url': '', token: undefined } },
  { name: 'deepseek', values: { model: 'deepseek-v4-pro', 'base-url': 'https://api.deepseek.com/anthropic', token: 'sk-secret' } },
  { name: 'no-token', values: { model: 'glm-5.3', 'base-url': 'https://open.bigmodel.cn/api/anthropic', token: undefined } },
  { name: 'stray-token', values: { model: 'x', 'base-url': undefined, token: 'sk-stray' } },
  { name: 'no-model', values: { model: '  ', 'base-url': undefined, token: undefined } },
  { name: 'bad-url', values: { model: 'x', 'base-url': 'ftp://example.com', token: 't' } },
])

const desktopSessionEnv = {
  PATH: 'C:\\bin',
  CLAUDECODE: '1',
  CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH: '1',
  CLAUDE_CODE_ENTRYPOINT: 'claude-desktop',
  CLAUDE_AGENT_SDK_VERSION: '0.3.299',
  ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
  USE_LOCAL_OAUTH: '',
  CLAUDE_CODE_PLUGIN_DIRS: 'D:\\mods',
  CLAUDE_CODE_USE_POWERSHELL_TOOL: '1',
}
/** 用户长期设的只有这一个；注册表里的名字按大写比 */
const persistent = new Set(['PATH', 'CLAUDE_CODE_USE_POWERSHELL_TOOL'])
const inherited = { PATH: 'C:\\bin', CLAUDE_CODE_USE_POWERSHELL_TOOL: '1' }

describe('模型配置', () => {
  it('逐份检查，不能用的写明原因、不回 token 的值以外的东西', () => {
    expect(entries.map((entry) => [entry.name, entry.tokenSet, entry.problem])).toEqual([
      ['sonnet', false, null],
      ['deepseek', true, null],
      ['no-token', false, '填了请求地址却没填 token'],
      ['stray-token', true, expect.stringContaining('没填请求地址')],
      ['no-model', false, '没填模型名'],
      ['bad-url', true, expect.stringContaining('http 或 https')],
    ])
  })

  it('Claude Code 的变量只传用户长期设的，桌面版塞进来的会话变量去掉', () => {
    expect(inheritedEnvironment(desktopSessionEnv, persistent)).toEqual(inherited)
    expect(inheritedEnvironment({ Claude_Code_Use_PowerShell_Tool: '1' }, persistent)).toEqual({ Claude_Code_Use_PowerShell_Tool: '1' })
  })

  it('没指定也没默认时用本机 Claude，不覆盖模型', () => {
    expect(prepareModel(entries, undefined, null, desktopSessionEnv, persistent)).toEqual({ modelName: null, model: undefined, env: inherited })
    expect(prepareModel(entries, null, 'deepseek', desktopSessionEnv, persistent).modelName).toBeNull()
  })

  it('不填请求地址的一份只换模型名，第三方的一份设请求地址、token 与三档模型', () => {
    expect(prepareModel(entries, 'sonnet', null, {}, persistent)).toEqual({ modelName: 'sonnet', model: 'claude-sonnet-5-5', env: {} })
    expect(prepareModel(entries, undefined, 'deepseek', {}, persistent)).toEqual({
      modelName: 'deepseek',
      model: 'deepseek-v4-pro',
      env: {
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
        ANTHROPIC_AUTH_TOKEN: 'sk-secret',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-v4-pro',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v4-pro',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-v4-pro',
        CLAUDE_CODE_SUBAGENT_MODEL: 'deepseek-v4-pro',
      },
    })
  })

  it('名字对不上或那份不能用直接报错', () => {
    expect(() => prepareModel(entries, 'kimi', null, {}, persistent)).toThrow('模型「kimi」不在设置的模型配置里；现有：sonnet、deepseek')
    expect(() => prepareModel(entries, undefined, 'kimi', {}, persistent)).toThrow('默认模型「kimi」')
    expect(() => prepareModel(entries, 'no-token', null, {}, persistent)).toThrow('没填 token')
  })

  it('setup-status 写明默认模型为什么用不了', () => {
    expect(describeDefaultModel(entries, null)).toBeNull()
    expect(describeDefaultModel(entries, 'deepseek')).toBeNull()
    expect(describeDefaultModel(entries, 'no-model')).toContain('没填模型名')
  })
})
