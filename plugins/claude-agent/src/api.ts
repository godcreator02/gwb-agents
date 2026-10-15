/** 一条会话在本插件里的记录；不存提示词与工具事件 */
export interface ClaudeAgentSession {
  sessionId: string
  workspace: string
  /** 设置里一组 models 的实例名；null 是本机已登录的 Claude、Claude Code 的默认模型。会话建立时定下，续聊不能换 */
  model: string | null
  /** 第几轮，从 1 起 */
  round: number
  /** running 以外都是这一轮结束了：交回了成功的结果是 completed，别的（出错、被打断、插件重载中断）是 failed */
  status: 'running' | 'completed' | 'failed'
  /** 这一轮的最终回答；failed 时是原因 */
  text: string
}

/** 这一轮跑到哪了，只在 running 时有，不存盘 */
export interface ClaudeAgentProgress {
  /** 主代理调过几次工具（子代理里的不算） */
  toolCalls: number
  /** 最近一次调的工具名 */
  lastTool: string | null
  /** 最近一段回答文字的末尾 */
  lastText: string | null
}

export interface ClaudeAgentStatus extends ClaudeAgentSession {
  progress: ClaudeAgentProgress | null
}

export interface ClaudeAgentCreateInput {
  /** 工作区目录的绝对路径，要已存在 */
  workspace: string
  /** 1~100000 字符 */
  prompt: string
  /** 设置里一组 models 的实例名；不给就用设置 default-model，那也空着就是本机已登录的 Claude */
  model?: string
}

export interface ClaudeAgentSessionInput {
  workspace: string
  /** create 回执里的 sessionId（UUID）；workspace 写建它时的那个目录 */
  sessionId: string
}

export interface ClaudeAgentSendInput extends ClaudeAgentSessionInput {
  prompt: string
  /** 上一轮还在跑时：true 先结束它（那一轮记 failed）再开这一轮；不给就报错 */
  interrupt?: boolean
}

export interface ClaudeAgentStarted {
  sessionId: string
  round: number
  model: string | null
  /** 只表示这一轮开始了，不是做完 */
  accepted: true
}

/** 初始化做到哪了，给 claude-agent.setup-status；不含 token 的值 */
export interface ClaudeAgentSetupStatus {
  sdk:
    | { ready: true; dir: string; version: string; claudeCodeVersion: string; claudeCodeExecutable: string; supportedVersions: string }
    | { ready: false; dir: string; problem: string; supportedVersions: string }
  models: Array<{ name: string; model: string | null; baseUrl: string | null; tokenSet: boolean; problem: string | null }>
  /** 设置 default-model；null 是没填，不给 model 时用本机已登录的 Claude */
  defaultModel: string | null
  /** default-model 填了却对不上任何一份可用的模型时，写明原因 */
  defaultModelProblem: string | null
}

/**
 * 服务 ctx.gwbClaudeAgent：经 Claude Agent SDK 跑无界面的 agent 会话，一轮调一次 SDK 的 query()，续聊用 resume。
 * 权限 bypassPermissions，加载本机的 Claude Code 设置、MCP、hooks。要用就 inject `gwbClaudeAgent`（可有可无时用 ctx.inject）。
 * 同一个工作区可以同时开几条会话；本服务不管占用，也不管回报。
 */
export interface GwbClaudeAgentApi {
  /** 新建会话并开始第一轮，开始了就交回 */
  create(input: ClaudeAgentCreateInput): Promise<ClaudeAgentStarted>
  /** 续一轮；上一轮还在跑时要带 interrupt: true 先打断它，否则报错 */
  send(input: ClaudeAgentSendInput): Promise<ClaudeAgentStarted>
  /** 读这条会话最新一轮的状态、回答与进度 */
  status(input: ClaudeAgentSessionInput): Promise<ClaudeAgentStatus>
  /** SDK 装好没有、各份模型配好没有 */
  setupStatus(): Promise<ClaudeAgentSetupStatus>
}
