import type { ArchivedTask } from './archive.js'
import type { SentRound } from './round.js'
import type { RoundState } from './task-progress.js'
import type { OpenedWorkspace } from './workspace.js'

export type { ArchivedTask, OpenedWorkspace, RoundState, SentRound }

/** MCP 客户端等一次调用有上限（Claude Code 是 300 秒没动静就放弃），status 的等待留出余量 */
export const MAX_WAIT_SECONDS = 240

export interface ZcodeWorkspaceInput {
  /** 工作区目录的绝对路径 */
  workspace: string
}

export interface ZcodeCreateInput extends ZcodeWorkspaceInput {
  /** 发给 ZCode 的任务说明 */
  prompt: string
}

export interface ZcodeTaskInput extends ZcodeWorkspaceInput {
  /** create 回执里的 taskId（sess_ 开头）；workspace 写建它时的那个目录 */
  task: string
}

export interface ZcodeSendInput extends ZcodeTaskInput {
  prompt: string
  /** true：不排队，当场取消这条会话正在跑的工具调用、用这条指令开新的一轮（同界面上排队消息的「立即」）；缺省排在当前这一轮后面 */
  interrupt?: boolean
}

export interface ZcodeStatusInput extends ZcodeTaskInput {
  /** 最多等这么多秒，做完提前交回；缺省 0 立即交回，不超过 MAX_WAIT_SECONDS */
  waitSeconds?: number
  /** 只交回回答末尾这么多个字符（正整数）；缺省全部交回 */
  replyTailChars?: number
}

export interface DispatchedRound extends SentRound {
  /**
   * 交给 Claude Code 的 Monitor 的命令行：等这一轮结束打一行 `ZCODE-ROUND-OVER {…}`（出错打 `ZCODE-WAIT-FAILED …`）后退出。
   * 经本 home 的 gwb-mcp 命令行客户端调 zcode.status，home 里没装 gwb-mcp 时运行它会报错
   */
  waitCommand: string
}

export interface ZcodeRoundStatus extends RoundState {
  /** 代理进程实际用的模式，不是侧栏上会落后的显示值 */
  mode: string
  /** 按 replyTailChars 省掉的字符数，没省是 0 */
  omittedReplyChars: number
}

/**
 * 服务 ctx.gwbZcode：把运行中的 ZCode 桌面端做成方法。要用就 inject `gwbZcode`（可有可无时用 ctx.inject）。
 * 要求 ZCode 桌面端开着、只有一个工作区窗口；指令一律以完全访问（yolo）发出。
 * 同一个工作区可以同时开几条会话，本服务不管占用，也不管回报：回报由派任务的一方写进提示词。
 */
export interface GwbZcodeApi {
  /** 把窗口切到这个工作区（已存在的目录）；侧栏只显示窗口当前工作区的会话 */
  open(input: ZcodeWorkspaceInput): Promise<OpenedWorkspace>
  /** 新建会话并发出第一轮，这一轮在快照里开始了就交回，不等做完 */
  create(input: ZcodeCreateInput): Promise<DispatchedRound>
  /** 往已有会话续一轮；上一轮还在跑时 ZCode 自己把它排在后面，interrupt 为 true 时打断上一轮立即发出 */
  send(input: ZcodeSendInput): Promise<DispatchedRound>
  /** 读最新一轮：roundIsOver 为 true 才是做完，replies 最后一条是收尾的话 */
  status(input: ZcodeStatusInput): Promise<ZcodeRoundStatus>
  /** 归档一条会话（还在跑的拒绝）；workspace 目录不在了也能归档 */
  archive(input: ZcodeTaskInput): Promise<ArchivedTask>
}
