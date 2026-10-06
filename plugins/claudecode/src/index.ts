import type { GwbContext } from '@godcreator/gwb-kernel-desktop'
import type {} from '@godcreator/gwb-commands'
import type {} from '@godcreator/gwb-settings'
import type {} from '@godcreator/gwb-data'
import { homedir } from 'node:os'
import path from 'node:path'
import { ClaudeRuntime } from './runtime.js'

export const name = 'gwb-claudecode'
export const inject = ['gwbCommands', 'gwbSettings', 'gwbData']
export function apply(ctx: GwbContext): void {
  const commands = ctx.gwbCommands, settings = ctx.gwbSettings
  if (commands === undefined || settings === undefined) throw new Error('Claude Code 依赖服务未就绪')
  settings.define({ key: 'executable', title: 'Claude Code 原生程序', type: 'string', default: path.join(homedir(), '.local', 'bin', 'claude.exe'), description: '本机 Claude Code 原生 exe 绝对路径；使用 bypassPermissions，仍加载现有登录、MCP 配置与纪律 hooks。' })
  const log = ctx.logger(name)
  const runtime = new ClaudeRuntime({ executable: () => String(settings.get('executable') ?? ''), read: () => ctx.gwbData.readDoc('sessions'), write: (value) => ctx.gwbData.writeDoc('sessions', value), error: (message) => log.error(message) })
  commands.register({ name: 'claudecode.create', description: '创建 Claude Code 原生会话并启动一轮，发出即返回', usage: '{workspace:string,prompt:string}。绝对工作区；返回 {sessionId,round,accepted:true}，仅表示进程启动，不是任务完成。权限模式为 bypassPermissions；MCP 与 hooks 继承本机配置，应用回报由任务指定。', effect: 'external' }, async (raw) => ({ ok: true, data: await runtime.submit(raw, false) }))
  commands.register({ name: 'claudecode.send', description: '续接本 home 的 Claude 会话', usage: '{workspace:string,sessionId:string,prompt:string}。工作区与会话必须匹配；使用CLI --resume续聊，等待本插件上一轮进程退出后启动；返回 {sessionId,round,accepted:true}。', effect: 'external' }, async (raw) => ({ ok: true, data: await runtime.submit(raw, true) }))
  commands.register({ name: 'claudecode.status', description: '读取进程事件保存的 Claude 会话状态，不轮询模型', usage: '{workspace:string,sessionId:string}。返回 {sessionId,workspace,round,status,text}；status为running/completed/failed/unknown。不表示应用已接收或送达。', effect: 'read' }, async (raw) => ({ ok: true, data: await runtime.status(raw) }))
  commands.register({ name: 'claudecode.resolve', description: '人工确认重载后状态不明的 Claude 会话已停止', usage: '{workspace:string,sessionId:string,confirmedStopped:true}。仅用于已核对原进程停止的unknown会话；不取消、不重派。', effect: 'write' }, async (raw) => ({ ok: true, data: await runtime.resolve(raw) }))
  ctx.effect(() => () => runtime.dispose())
}
