import { Service } from 'cordis'
import type { GwbContext } from '@godcreator/gwb-kernel-desktop'
// 空的类型 import 只为让这几个包的 `declare module 'cordis'` 生效，ctx 上才有对应服务的类型
import type {} from '@godcreator/gwb-commands'
import type {} from '@godcreator/gwb-settings'
import type {} from '@godcreator/gwb-data'
import type {} from '@godcreator/gwb-skills'
import type {
  ClaudeAgentCreateInput,
  ClaudeAgentSendInput,
  ClaudeAgentSessionInput,
  ClaudeAgentSetupStatus,
  ClaudeAgentStarted,
  ClaudeAgentStatus,
  GwbClaudeAgentApi,
} from './api.js'
import { parseCreateArgs, parseSendArgs, parseSetupStatusArgs, parseStatusArgs } from './args.js'
import { endProcessTree, readPersistentVariableNames, spawnClaudeCode } from './claude-process.js'
import { MODEL_FIELDS, MODELS_GROUP, prepareModel, readModelEntries, describeDefaultModel } from './models.js'
import { ClaudeAgentRuntime } from './runtime.js'
import { importSdk, inspectSdkInstallation, SDK_PACKAGE_NAME, SETUP_SKILL_NAME, SUPPORTED_SDK_VERSIONS } from './sdk-loader.js'

export * from './api.js'

const PLUGIN_NAME = 'gwb-claude-agent'

/** 服务 gwbClaudeAgent 的提供方；claude-agent.* 命令是它给 agent 的薄封装 */
export default class GwbClaudeAgent extends Service implements GwbClaudeAgentApi {
  static inject = ['gwbCommands', 'gwbSettings', 'gwbData']

  /** 方法里的 `this.ctx` 是调用方的；设置、命令与这一轮的清理登记在提供方自己的上下文上 */
  private readonly providerContext: GwbContext
  private readonly runtime: ClaudeAgentRuntime

  constructor(ctx: GwbContext) {
    super(ctx, 'gwbClaudeAgent')
    this.providerContext = ctx
    const log = ctx.logger(PLUGIN_NAME)
    this.runtime = new ClaudeAgentRuntime({
      prepareRound: async (modelName) => {
        const installation = await inspectSdkInstallation(this.sdkDir())
        const sdk = await importSdk(installation)
        const entries = readModelEntries(ctx.gwbSettings.getGroup(MODELS_GROUP))
        const prepared = prepareModel(entries, modelName, this.defaultModel(), process.env, await readPersistentVariableNames())
        return { modelName: prepared.modelName, round: { query: sdk.query, model: prepared.model, env: prepared.env } }
      },
      readSessions: () => ctx.gwbData.readDoc('sessions'),
      writeSessions: (value) => ctx.gwbData.writeDoc('sessions', value),
      error: (message) => log.error(message),
      spawnClaudeCode,
      endProcessTree,
    })
  }

  [Service.init](): void {
    const ctx = this.providerContext
    const commands = ctx.gwbCommands
    if (commands === undefined) throw new Error('ctx.gwbCommands 不在：inject 里写了它，cordis 本不该调用到这里')
    ctx.gwbSettings.define({
      key: 'sdk-dir',
      title: 'Claude Agent SDK 包目录',
      type: 'string',
      description: `npm 装好的 ${SDK_PACKAGE_NAME} 包目录的绝对路径（npm ls -g 交回的 path）。插件只认这里，不去别处找；怎么装读说明书 ${SETUP_SKILL_NAME}`,
    })
    ctx.gwbSettings.defineGroup({
      key: MODELS_GROUP,
      title: '模型',
      description: '每行一份模型配置的名字（kebab-case）；每份填模型名，第三方模型再填请求地址与 token。没有一份时用本机已登录的 Claude',
      fields: MODEL_FIELDS,
    })
    ctx.gwbSettings.define({
      key: 'default-model',
      title: '默认模型',
      type: 'string',
      description: 'create 不给 model 时用的那份模型配置的名字；空着就用本机已登录的 Claude、Claude Code 的默认模型',
    })
    commands.register({
      name: 'claude-agent.create',
      description: '经 Claude Agent SDK 新建一条无界面会话并开始第一轮，发出即返回',
      usage: '{workspace:string,prompt:string,model?:string}。workspace 是已存在目录的绝对路径，prompt 1~100000 字符；model 是设置里一组 models 的实例名，不给用设置 default-model，那也空着就用本机已登录的 Claude。返回 {sessionId,round,model,accepted:true}，只表示开始了。权限 bypassPermissions，加载本机 Claude Code 的设置、MCP 与 hooks；回报由派任务的一方写进提示词。同一个工作区可以同时开几条会话',
      effect: 'external',
    }, async (raw) => ({ ok: true, data: await this.create(parseCreateArgs(raw)) }))
    commands.register({
      name: 'claude-agent.send',
      description: '在本 home 的 claude-agent 会话上续一轮',
      usage: '{workspace:string,sessionId:string,prompt:string,interrupt?:boolean}。工作区与会话必须匹配，模型沿用会话建立时的那份；上一轮还在跑时不带 interrupt 就报错，带 interrupt:true 先结束它（那一轮记 failed）再开这一轮。返回 {sessionId,round,model,accepted:true}',
      effect: 'external',
    }, async (raw) => ({ ok: true, data: await this.send(parseSendArgs(raw)) }))
    commands.register({
      name: 'claude-agent.status',
      description: '读 claude-agent 会话最新一轮的状态、回答与进度',
      usage: '{workspace:string,sessionId:string}。返回 {sessionId,workspace,model,round,status,text,progress}；status 为 running / completed / failed，running 以外都是这一轮结束了；progress 只在 running 时有：{toolCalls,lastTool,lastText}，lastText 是最近一段回答的末尾',
      effect: 'read',
    }, async (raw) => ({ ok: true, data: await this.status(parseStatusArgs(raw)) }))
    commands.register({
      name: 'claude-agent.setup-status',
      description: '查 claude-agent 初始化做到哪了：SDK 装好没有、各份模型配好没有',
      usage: `无参数。返回 {sdk,models,defaultModel,defaultModelProblem}：sdk.ready 为 false 时 problem 写明原因（没配 sdk-dir、版本不在 ${SUPPORTED_SDK_VERSIONS}、缺附带的 Claude Code）；models 每份 {name,model,baseUrl,tokenSet,problem}，不含 token 的值`,
      effect: 'read',
    }, async (raw) => {
      parseSetupStatusArgs(raw)
      return { ok: true, data: await this.setupStatus() }
    })
    ctx.inject(['gwbSkills'], (scoped) => {
      // 说明书在包根的 skills/，相对产物 dist/index.js 写作 '../skills/'；那个目录要在 package.json 的 files 里
      scoped.effect(() => scoped.gwbSkills.register(new URL('../skills/', import.meta.url)))
    })
    ctx.effect(() => () => this.runtime.dispose())
  }

  private sdkDir(): string {
    const value = this.providerContext.gwbSettings.get('sdk-dir')
    return typeof value === 'string' ? value.trim() : ''
  }

  private defaultModel(): string | null {
    const value = this.providerContext.gwbSettings.get('default-model')
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
  }

  create(input: ClaudeAgentCreateInput): Promise<ClaudeAgentStarted> { return this.runtime.create(input) }
  send(input: ClaudeAgentSendInput): Promise<ClaudeAgentStarted> { return this.runtime.send(input) }
  status(input: ClaudeAgentSessionInput): Promise<ClaudeAgentStatus> { return this.runtime.status(input) }

  async setupStatus(): Promise<ClaudeAgentSetupStatus> {
    const ctx = this.providerContext
    const dir = this.sdkDir()
    let sdk: ClaudeAgentSetupStatus['sdk']
    try {
      const installation = await inspectSdkInstallation(dir)
      sdk = { ready: true, ...installation, supportedVersions: SUPPORTED_SDK_VERSIONS }
    } catch (error) {
      sdk = { ready: false, dir, problem: error instanceof Error ? error.message : String(error), supportedVersions: SUPPORTED_SDK_VERSIONS }
    }
    const entries = readModelEntries(ctx.gwbSettings.getGroup(MODELS_GROUP))
    const defaultModel = this.defaultModel()
    return {
      sdk,
      models: entries.map((entry) => ({ name: entry.name, model: entry.model, baseUrl: entry.baseUrl, tokenSet: entry.tokenSet, problem: entry.problem })),
      defaultModel,
      defaultModelProblem: describeDefaultModel(entries, defaultModel),
    }
  }
}

declare module 'cordis' {
  interface Context {
    gwbClaudeAgent: GwbClaudeAgentApi
  }
}
