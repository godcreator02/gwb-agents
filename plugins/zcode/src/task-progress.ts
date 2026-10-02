/** 从 ZCode 客户端的任务快照（zcodeTaskService.getTaskSnapshot 的返回）判断一轮指令做完没有、取出回答 */

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

export interface RoundOutcome {
  taskId: string
  title: string
  status: string | null
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

/**
 * 判断这一轮做完没有。status 会落后于消息：刚发出时还是上一轮的 completed，转成 completed 时回答可能还没写进快照，
 * 所以只认三件事一起成立——这一轮已经开始（出现了发出前没有的消息）、状态是结束类的、这一轮的回答都写完了（有 durationMs）；
 * 失败类状态在这一轮开始之后才算数。停在等人确认权限时也交回，让调用方知道它卡住了
 */
export function judgeRound(snapshot: TaskSnapshot, taskId: string, messageIdsBeforeSend: Set<string>): { roundIsOver: boolean; outcome: RoundOutcome } {
  const newMessages = snapshot.messages.filter((m) => !messageIdsBeforeSend.has(m.id))
  const newAssistantMessages = newMessages.filter((m) => m.role === 'assistant')
  const replies = newAssistantMessages.filter((m) => m.content !== '').map((m) => m.content)
  const pendingPermissions = snapshot.runtime?.pendingPermissions ?? []
  const status = snapshot.meta.status ?? null
  const roundStarted = newMessages.length > 0
  const repliesWritten = newAssistantMessages.length > 0 && newAssistantMessages.every((m) => typeof m.durationMs === 'number')
  const succeeded = status !== null && FINISHED_STATUSES.includes(status) && repliesWritten
  const failed = status !== null && FAILED_STATUSES.includes(status)
  return {
    roundIsOver: (roundStarted && (succeeded || failed)) || pendingPermissions.length > 0,
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
