/** 从 ZCode 客户端的任务快照（zcodeTaskService.getTaskSnapshot 的返回）判断一轮指令做完没有、取出回答 */

/** 界面上的「完全访问」 */
export const FULL_ACCESS_MODE = 'yolo'

const FINISHED_STATUSES = ['completed', 'idle', 'failed', 'error', 'cancelled']
const FAILED_STATUSES = ['failed', 'error', 'cancelled']

export interface SnapshotMessage {
  id: string
  role: string
  content: string
}

export interface TaskSnapshot {
  meta: { title: string; status: string; mode: string }
  messages: SnapshotMessage[]
  fileChanges: unknown
  runtime?: { pendingPermissions?: unknown[] }
}

export interface RoundOutcome {
  taskId: string
  title: string
  status: string
  mode: string
  replies: string[]
  fileChanges: unknown
  pendingPermissions: unknown[]
  timedOut: boolean
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
  if (!isRecord(meta) || typeof meta['status'] !== 'string' || typeof meta['mode'] !== 'string') return fail('meta 缺 status 或 mode')
  if (!Array.isArray(messages)) return fail('messages 不是数组')
  return raw as unknown as TaskSnapshot
}

export function assistantMessageIds(snapshot: TaskSnapshot): Set<string> {
  return new Set(snapshot.messages.filter((m) => m.role === 'assistant').map((m) => m.id))
}

/**
 * 这一轮算结束的条件：状态是结束类的，并且已经有了这一轮的新回答（刚发出时状态还停在上一轮的 completed），
 * 或者状态是失败类的；另外停在等人确认权限时也交回，让调用方知道它卡住了
 */
export function judgeRound(snapshot: TaskSnapshot, taskId: string, assistantIdsBeforeSend: Set<string>): { roundIsOver: boolean; outcome: RoundOutcome } {
  const replies = snapshot.messages
    .filter((m) => m.role === 'assistant' && m.content !== '' && !assistantIdsBeforeSend.has(m.id))
    .map((m) => m.content)
  const pendingPermissions = snapshot.runtime?.pendingPermissions ?? []
  const status = snapshot.meta.status
  const finished = FINISHED_STATUSES.includes(status) && (replies.length > 0 || FAILED_STATUSES.includes(status))
  return {
    roundIsOver: finished || pendingPermissions.length > 0,
    outcome: {
      taskId,
      title: snapshot.meta.title,
      status,
      mode: snapshot.meta.mode,
      replies,
      fileChanges: snapshot.fileChanges,
      pendingPermissions,
      timedOut: false,
    },
  }
}
