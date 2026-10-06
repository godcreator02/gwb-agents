/** 一条 Claude Code 会话在本插件里的记录；不存提示词与工具事件 */
export interface ClaudecodeSession {
  sessionId: string
  workspace: string
  /** 第几轮，从 1 起 */
  round: number
  /** running 以外都是这一轮结束了：进程正常退出且交回了结果是 completed，别的（非零退出、没有结果、插件重载中断）是 failed */
  status: 'running' | 'completed' | 'failed'
  /** 这一轮的最终回答；失败时是原因 */
  text: string
}

export interface ClaudecodeCreateInput {
  /** 工作区目录的绝对路径，要已存在 */
  workspace: string
  /** 1~100000 字符，经 stdin 交给进程 */
  prompt: string
}

export interface ClaudecodeSessionInput {
  workspace: string
  /** create 回执里的 sessionId（UUID）；workspace 写建它时的那个目录 */
  sessionId: string
}

export interface ClaudecodeSendInput extends ClaudecodeSessionInput {
  prompt: string
}

export interface ClaudecodeStarted {
  sessionId: string
  round: number
  /** 只表示进程启动了，不是这一轮做完 */
  accepted: true
}

/**
 * 服务 ctx.gwbClaudecode：无界面的 Claude Code 原生会话，一轮一个 `claude -p` 进程（bypassPermissions，加载本机的登录、MCP 与 hooks）。
 * 要用就 inject `gwbClaudecode`（可有可无时用 ctx.inject）。进程退出就是这一轮结束；同一个工作区可以同时开几条会话，本服务不管占用，也不管回报。
 */
export interface GwbClaudecodeApi {
  /** 新建会话并启动第一轮，进程起来就交回 */
  create(input: ClaudecodeCreateInput): Promise<ClaudecodeStarted>
  /** 续一轮（--resume）；同一会话上一轮的进程还没退出就等它退出再启动 */
  send(input: ClaudecodeSendInput): Promise<ClaudecodeStarted>
  /** 读这条会话最新一轮的状态与回答，不碰进程 */
  status(input: ClaudecodeSessionInput): Promise<ClaudecodeSession>
}
