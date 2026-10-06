import fs from 'node:fs'
import path from 'node:path'
import { MAX_WAIT_SECONDS } from './api.js'

/** 服务方法入口的取值校验：服务与命令两条路都经这里，命令那边只查形状 */

export function requireAbsoluteWorkspace(workspace: string): void {
  if (!path.win32.isAbsolute(workspace)) throw new Error(`workspace 要是工作区目录的绝对路径，收到 ${workspace}`)
}

export function requireExistingWorkspace(workspace: string): void {
  requireAbsoluteWorkspace(workspace)
  if (!fs.statSync(workspace, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`workspace 不是已存在的目录：${workspace}`)
}

export function requireWaitSeconds(waitSeconds: number): void {
  if (!Number.isFinite(waitSeconds) || waitSeconds < 0 || waitSeconds > MAX_WAIT_SECONDS) {
    throw new Error(`waitSeconds 要是 0 到 ${MAX_WAIT_SECONDS} 之间的秒数，收到 ${waitSeconds}`)
  }
}

export function requireReplyTailChars(replyTailChars: number): void {
  if (!Number.isInteger(replyTailChars) || replyTailChars < 1) throw new Error(`replyTailChars 要是正整数（字符数），收到 ${replyTailChars}`)
}
