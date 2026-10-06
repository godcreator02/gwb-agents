/**
 * 直报回报与 workspace 占用的共享协议：发起方（qq-bot、协作站等）与底层执行端插件共用，
 * 两边的措辞与判定只在这一份里。纯函数、零依赖；运行时的落盘、队列、投递都在各自的插件里。
 */

export type ReportState = 'completed' | 'failed' | 'needs_input'
export interface DirectReport { ticket: string; state: ReportState; text: string }

export const MAX_REPORT_TEXT = 16000
const TICKET_PATTERN = /^[a-f0-9]{64}$/u
const REPORT_KEYS = ['ticket', 'state', 'text']
const REPORT_STATES: ReportState[] = ['completed', 'failed', 'needs_input']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 校验一份直报。形状、票据（64 位十六进制）、state 枚举、正文 1–16000 且不含票据；错了直接抛，说明缺什么。 */
export function parseReport(raw: unknown): DirectReport {
  if (!isRecord(raw) || Object.keys(raw).some((key) => !REPORT_KEYS.includes(key))) throw new Error('回报参数应为 {ticket,state:completed|failed|needs_input,text:1~16000字符}')
  if (typeof raw.ticket !== 'string' || !TICKET_PATTERN.test(raw.ticket)) throw new Error('ticket 应是 64 位十六进制字符串，由发起方随任务提供')
  if (typeof raw.state !== 'string' || !REPORT_STATES.includes(raw.state as ReportState)) throw new Error('state 只能是 completed、failed 或 needs_input')
  if (typeof raw.text !== 'string' || raw.text.trim() === '' || raw.text.length > MAX_REPORT_TEXT) throw new Error(`text 应是 1~${MAX_REPORT_TEXT}字符的结果摘要`)
  if (raw.text.includes(raw.ticket)) throw new Error('回报正文不能包含回报凭证')
  return { ticket: raw.ticket, state: raw.state as ReportState, text: raw.text }
}

/** 同票幂等判定：同一轮任务里，state 与 text 都相同才算「重交同一结果」，否则是不同结果、拒绝覆盖。 */
export function sameOutcome(a: DirectReport, b: DirectReport): boolean {
  return a.state === b.state && a.text === b.text
}

/** 底层执行端插件忙时的统一错误：同 workspace 同一时间只跑一轮。holder 是占用中的会话标识（taskId / sessionId）。 */
export function workspaceOccupiedMessage(holder: string): string {
  return `workspace 已被会话 ${holder} 占用：同工作区同一时间只跑一轮；先查那一轮做完没有，做完（或人工核对已停止）后再派`
}

/** 上层按这个认「占用中」：收到它就把任务留在队列或回绝发起者，不是派单失败。 */
export function isWorkspaceOccupied(message: string): boolean {
  return message.startsWith('workspace 已被会话') && message.includes('占用')
}
