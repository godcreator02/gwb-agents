import type { ChildProcess } from 'node:child_process'

/**
 * 本插件用到的那一小部分 Claude Agent SDK 接口，照 SDK 0.3.299 的 sdk.d.ts 写。
 * SDK 不打包、也不进依赖（附带的平台包约 257 MB），运行时从设置 sdk-dir 动态 import；支持的版本范围见 sdk-loader.ts。
 * SDK 交回的消息在 runtime.ts 按 unknown 收、逐项收窄。
 */
/** SDK 交给 spawnClaudeCodeProcess 的参数；signal 在 SDK 给过约 2 秒自行退出的机会之后才触发 */
export interface SdkSpawnOptions {
  command: string
  args: string[]
  cwd?: string
  env: Record<string, string | undefined>
  signal: AbortSignal
}

export interface SdkQueryOptions {
  cwd: string
  /** 不给就用 Claude Code 自己的默认模型 */
  model?: string
  env: Record<string, string | undefined>
  /** 新会话用自己定的 UUID；和 resume 二选一 */
  sessionId?: string
  resume?: string
  permissionMode: 'bypassPermissions'
  allowDangerouslySkipPermissions: true
  /** 由插件自己启动 Claude Code，好拿到 pid；SDK 要的是 ChildProcess 的 stdin、stdout、kill 与 exit 事件 */
  spawnClaudeCodeProcess: (options: SdkSpawnOptions) => ChildProcess
}

export interface SdkQuery extends AsyncIterable<unknown> {
  /** 结束这一轮：SDK 启动的 Claude Code 进程被结束，之后不再有消息 */
  close(): void
}

export type SdkQueryFunction = (params: { prompt: string; options: SdkQueryOptions }) => SdkQuery

export interface ClaudeAgentSdk {
  query: SdkQueryFunction
}
