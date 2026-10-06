import { homedir } from 'node:os'
import path from 'node:path'
import { Service } from 'cordis'
import type { GwbContext } from '@godcreator/gwb-kernel-desktop'
// 空的类型 import 只为让这几个包的 `declare module 'cordis'` 生效，ctx 上才有对应服务的类型
import type {} from '@godcreator/gwb-commands'
import type {} from '@godcreator/gwb-settings'
import type {} from '@godcreator/gwb-data'
import type { ClaudecodeCreateInput, ClaudecodeSendInput, ClaudecodeSession, ClaudecodeSessionInput, ClaudecodeStarted, GwbClaudecodeApi } from './api.js'
import { parseCreateArgs, parseSendArgs, parseStatusArgs } from './args.js'
import { ClaudeRuntime } from './runtime.js'

export * from './api.js'

const PLUGIN_NAME = 'gwb-claudecode'

/** 服务 gwbClaudecode 的提供方；claudecode.* 命令是它给 agent 的薄封装 */
export default class GwbClaudecode extends Service implements GwbClaudecodeApi {
  static inject = ['gwbCommands', 'gwbSettings', 'gwbData']

  /** 方法里的 `this.ctx` 是调用方的；设置、命令与进程的清理登记在提供方自己的上下文上 */
  private readonly providerContext: GwbContext
  private readonly runtime: ClaudeRuntime

  constructor(ctx: GwbContext) {
    super(ctx, 'gwbClaudecode')
    this.providerContext = ctx
    const log = ctx.logger(PLUGIN_NAME)
    this.runtime = new ClaudeRuntime({
      executable: () => String(ctx.gwbSettings.get('executable') ?? ''),
      read: () => ctx.gwbData.readDoc('sessions'),
      write: (value) => ctx.gwbData.writeDoc('sessions', value),
      error: (message) => log.error(message),
    })
  }

  [Service.init](): void {
    const ctx = this.providerContext
    const commands = ctx.gwbCommands
    if (commands === undefined) throw new Error('ctx.gwbCommands 不在：inject 里写了它，cordis 本不该调用到这里')
    ctx.effect(() => ctx.gwbSettings.define({ key: 'executable', title: 'Claude Code 原生程序', type: 'string', default: path.join(homedir(), '.local', 'bin', 'claude.exe'), description: '本机 Claude Code 原生 exe 绝对路径；使用 bypassPermissions，仍加载现有登录、MCP 配置与纪律 hooks。' }))
    commands.register({ name: 'claudecode.create', description: '创建 Claude Code 原生会话并启动一轮，发出即返回', usage: '{workspace:string,prompt:string}。绝对工作区，prompt 1~100000 字符；返回 {sessionId,round,accepted:true}，仅表示进程启动，不是任务完成。权限模式为 bypassPermissions；MCP 与 hooks 继承本机配置，回报由派任务的一方写进提示词。同一个工作区可以同时开几条会话。', effect: 'external' }, async (raw) => ({ ok: true, data: await this.create(parseCreateArgs(raw)) }))
    commands.register({ name: 'claudecode.send', description: '续接本 home 的 Claude 会话', usage: '{workspace:string,sessionId:string,prompt:string}。工作区与会话必须匹配；使用 CLI --resume 续聊，等这条会话上一轮的进程退出后启动；返回 {sessionId,round,accepted:true}。', effect: 'external' }, async (raw) => ({ ok: true, data: await this.send(parseSendArgs(raw)) }))
    commands.register({ name: 'claudecode.status', description: '读取进程事件保存的 Claude 会话状态，不轮询模型', usage: '{workspace:string,sessionId:string}。返回 {sessionId,workspace,round,status,text}；status 为 running / completed / failed，running 以外都是这一轮结束了，插件重载或工作台退出中断的轮次记 failed。', effect: 'read' }, async (raw) => ({ ok: true, data: await this.status(parseStatusArgs(raw)) }))
    ctx.effect(() => () => this.runtime.dispose())
  }

  create(input: ClaudecodeCreateInput): Promise<ClaudecodeStarted> { return this.runtime.create(input) }
  send(input: ClaudecodeSendInput): Promise<ClaudecodeStarted> { return this.runtime.send(input) }
  status(input: ClaudecodeSessionInput): Promise<ClaudecodeSession> { return this.runtime.status(input) }
}

declare module 'cordis' {
  interface Context {
    gwbClaudecode: GwbClaudecodeApi
  }
}
