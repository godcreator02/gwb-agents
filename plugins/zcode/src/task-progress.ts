/** 从 ZCode 客户端的任务快照（zcodeTaskService.getTaskSnapshot 的返回）判断最新一轮做完没有、取出回答 */

/** 界面上的「完全访问」 */
export const FULL_ACCESS_MODE = 'yolo'

const FINISHED_STATUSES = ['completed', 'idle', 'failed', 'error', 'cancelled']
const FAILED_STATUSES = ['failed', 'error', 'cancelled']

export interface SnapshotMessage {
  id: string
  role: string
  content: string
  /** 一轮里的回答按同一个 id 越写越长，写完这一条才有 durationMs */
  durationMs?: number | null
}

export interface TaskSnapshot {
  /** 新建、还没发过指令的会话没有 status */
  meta: { title: string; status?: string; mode: string }
  messages: SnapshotMessage[]
  fileChanges: unknown
  runtime?: { pendingPermissions?: unknown[] }
}

export interface RoundState {
  taskId: string
  title: string
  status: string | null
  roundIsOver: boolean
  replies: string[]
  fileChanges: unknown
  pendingPermissions: unknown[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 系统边界：快照来自 ZCode 内部接口，形状不对就说明 ZCode 改了，直接报错 */
export function readSnapshot(raw: unknown, taskId: string): TaskSnapshot {
  const fail = (what: string): never => {
    throw new Error(`会话 ${taskId} 的快照形状不对（${what}），ZCode 内部接口可能变了`)
  }
  if (!isRecord(raw)) return fail('不是对象')
  const { meta, messages } = raw
  if (!isRecord(meta) || typeof meta['mode'] !== 'string') return fail('meta 缺 mode')
  if (meta['status'] !== undefined && typeof meta['status'] !== 'string') return fail('meta.status 不是字符串')
  if (!Array.isArray(messages)) return fail('messages 不是数组')
  return raw as unknown as TaskSnapshot
}

/** zcodeAgentService.readSession 的返回里，代理进程实际用的模式在 settings.mode.current */
export function readAgentMode(raw: unknown, taskId: string): string {
  const mode = isRecord(raw) && isRecord(raw['settings']) && isRecord(raw['settings']['mode']) ? raw['settings']['mode']['current'] : undefined
  if (typeof mode !== 'string') throw new Error(`会话 ${taskId} 的代理设置里没有 settings.mode.current，ZCode 内部接口可能变了`)
  return mode
}

export function messageIds(snapshot: TaskSnapshot): Set<string> {
  return new Set(snapshot.messages.map((m) => m.id))
}

/** 发出的指令在快照里出现了，这一轮才算开始；刚发出时快照里还是上一轮 */
export function roundHasStarted(snapshot: TaskSnapshot, messageIdsBeforeSend: Set<string>): boolean {
  return snapshot.messages.some((m) => m.role === 'user' && !messageIdsBeforeSend.has(m.id))
}

/**
 * 最新一轮就是最后一条用户消息之后的消息。status 会落后于消息：转成 completed 时回答可能还没写进快照，
 * 所以要状态是结束类的、并且这一轮的助手消息都写完了（有 durationMs）才算做完；失败类状态不等回答。
 * 停在等人确认权限时也算这一轮停下了，让调用方知道它卡住了
 */
export function readLatestRound(snapshot: TaskSnapshot, taskId: string): RoundState {
  const lastUserIndex = snapshot.messages.findLastIndex((m) => m.role === 'user')
  const roundMessages = lastUserIndex === -1 ? [] : snapshot.messages.slice(lastUserIndex + 1)
  const assistantMessages = roundMessages.filter((m) => m.role === 'assistant')
  const pendingPermissions = snapshot.runtime?.pendingPermissions ?? []
  const status = snapshot.meta.status ?? null
  const repliesWritten = assistantMessages.length > 0 && assistantMessages.every((m) => typeof m.durationMs === 'number')
  const succeeded = status !== null && FINISHED_STATUSES.includes(status) && repliesWritten
  const failed = lastUserIndex !== -1 && status !== null && FAILED_STATUSES.includes(status)
  return {
    taskId,
    title: snapshot.meta.title,
    status,
    roundIsOver: succeeded || failed || pendingPermissions.length > 0,
    replies: assistantMessages.filter((m) => m.content !== '').map((m) => m.content),
    fileChanges: snapshot.fileChanges,
    pendingPermissions,
  }
}

/**
 * 从最后一条回答往前留，合计不超过 maxChars 个字符，越过上限的那一条只留它的末尾。
 * 收尾的总结在最后；ZCode 会把这一轮的工具调用记录也写进回答，一条就可能有几万字
 */
export function keepReplyTail(replies: string[], maxChars: number): { replies: string[]; omittedReplyChars: number } {
  const kept: string[] = []
  let room = maxChars
  for (let i = replies.length - 1; i >= 0 && room > 0; i--) {
    const reply = replies[i]!
    kept.unshift(reply.length <= room ? reply : reply.slice(reply.length - room))
    room -= reply.length
  }
  const total = replies.reduce((sum, reply) => sum + reply.length, 0)
  const keptChars = kept.reduce((sum, reply) => sum + reply.length, 0)
  return { replies: kept, omittedReplyChars: total - keptChars }
}
