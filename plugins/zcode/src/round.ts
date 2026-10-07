import type { DesktopServices } from './desktop.js'
import { FULL_ACCESS_MODE, type RoundState, messageIds, readAgentMode, readLatestRound, readSnapshot, roundHasStarted } from './task-progress.js'

const POLL_INTERVAL_MS = 2000
const START_POLL_INTERVAL_MS = 500
/** 实测发出后约 2 秒这一轮的提问出现在快照里；排在上一轮后面（上一轮还在跑）时会更久，到点就先交回 */
const START_WAIT_MS = 30_000
const SNAPSHOT_MESSAGE_LIMIT = 50
const CLIENT_MODE = 'desktop-continuous'
const ASK_BEFORE_CHANGES_MODE = 'build'
/** sendText 的投递方式之一：当场取消正在跑的工具调用、开新的一轮。另一种「引导当前任务」（guide）在跑命令时会被降成排队，不用 */
const START_NOW_DELIVERY = 'startNow'
export const RUNNING_STATUS = 'running'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export async function snapshotOf(services: DesktopServices, workspace: string, taskId: string) {
  const raw = await services.call('zcodeTaskService', 'getTaskSnapshot', {
    workspacePath: workspace,
    taskId,
    messageLimit: SNAPSHOT_MESSAGE_LIMIT,
    clientMode: CLIENT_MODE,
  })
  return readSnapshot(raw, taskId)
}

async function agentModeOf(services: DesktopServices, workspace: string, taskId: string): Promise<string> {
  return readAgentMode(await services.call('zcodeAgentService', 'readSession', { workspacePath: workspace, sessionId: taskId }), taskId)
}

export async function createTask(services: DesktopServices, workspace: string): Promise<string> {
  const created = (await services.call('zcodeTaskService', 'createTask', { workspacePath: workspace, v4Create: true })) as { taskId?: unknown }
  if (typeof created.taskId !== 'string') throw new Error(`zcodeTaskService.createTask 没回 taskId：${JSON.stringify(created)}`)
  return created.taskId
}

/**
 * 以代理进程的模式为准：不是 yolo 就切，切完读回还不是就不发指令。
 * 任务的 meta.mode（侧栏与界面显示的那个）只在代理的模式真的变了时才更新，会落后：新会话继承到工作区上次用的 yolo、
 * 跑过的会话放一阵子再恢复，都可能代理是 yolo、界面显示「变更前确认」。这时先切 build 再切 yolo 让显示跟上，
 * 但只在这条会话没在跑的时候做：跑着的时候切到 build，这一瞬间的工具调用会停下等确认
 */
async function switchToFullAccess(services: DesktopServices, workspace: string, taskId: string): Promise<string> {
  // 先读快照：它会让 ZCode 恢复这条会话，之后 readSession 才读得到
  const before = await snapshotOf(services, workspace, taskId)
  const agentModeBefore = await agentModeOf(services, workspace, taskId)
  if (agentModeBefore !== FULL_ACCESS_MODE) {
    await services.call('zcodeTaskService', 'setMode', { taskId, mode: FULL_ACCESS_MODE })
  } else if (before.meta.mode !== FULL_ACCESS_MODE && before.meta.status !== RUNNING_STATUS) {
    await services.call('zcodeTaskService', 'setMode', { taskId, mode: ASK_BEFORE_CHANGES_MODE })
    await services.call('zcodeTaskService', 'setMode', { taskId, mode: FULL_ACCESS_MODE })
  }
  const agentMode = await agentModeOf(services, workspace, taskId)
  if (agentMode !== FULL_ACCESS_MODE) {
    throw new Error(`会话 ${taskId} 切换到完全访问（${FULL_ACCESS_MODE}）后代理的模式是 ${agentMode}，已停止，指令没有发出`)
  }
  return agentMode
}

export interface SentRound {
  taskId: string
  title: string
  status: string | null
  /** 代理进程实际用的模式，总是 yolo */
  mode: string
  /** false：30 秒内这一轮的提问还没出现在快照里（多半排在还在跑的上一轮后面），这时 zcode.status 读到的仍是上一轮 */
  roundStarted: boolean
}

/**
 * 不排队、立即发：zcodeTaskService.sendPrompt 不收投递方式，只能直接发会话命令 sendText 并要求 startNow，
 * 跟界面上排队消息的「立即」效果相同。ZCode 收下了却没按 startNow 投递（比如排进了队列）就报错，写明它实际怎么投递的
 */
async function sendInterrupting(services: DesktopServices, workspace: string, taskId: string, prompt: string): Promise<void> {
  const reply = (await services.call('zcodeAgentService', 'sendConversationCommandV4', {
    workspacePath: workspace,
    clientMode: CLIENT_MODE,
    envelope: {
      commandId: crypto.randomUUID(),
      clientId: await services.readConversationClientId(),
      sessionId: taskId,
      type: 'sendText',
      payload: { text: prompt, requestedDelivery: START_NOW_DELIVERY, heldQueueDisposition: 'keepQueueAndSend' },
      issuedAt: Date.now(),
    },
  })) as { status?: unknown; result?: { delivery?: unknown } }
  if (reply.status !== 'accepted') throw new Error(`ZCode 没收下这条指令：${JSON.stringify(reply)}`)
  if (reply.result?.delivery !== START_NOW_DELIVERY) {
    throw new Error(`ZCode 收下了这条指令，但没有立即发出，而是按 ${JSON.stringify(reply.result?.delivery)} 投递（多半排进了队列）：${JSON.stringify(reply)}`)
  }
}

/** 切到完全访问、发出指令，等这一轮在快照里开始了就交回，不等它做完 */
export async function sendRound(
  services: DesktopServices,
  { workspace, taskId, prompt, interrupt = false }: { workspace: string; taskId: string; prompt: string; interrupt?: boolean },
): Promise<SentRound> {
  const agentMode = await switchToFullAccess(services, workspace, taskId)
  const messageIdsBeforeSend = messageIds(await snapshotOf(services, workspace, taskId))
  if (interrupt) {
    await sendInterrupting(services, workspace, taskId, prompt)
  } else {
    await services.call('zcodeTaskService', 'sendPrompt', {
      taskId,
      content: prompt,
      traceId: crypto.randomUUID(),
      queryId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      clientMode: CLIENT_MODE,
    })
  }
  const deadline = Date.now() + START_WAIT_MS
  for (;;) {
    const snapshot = await snapshotOf(services, workspace, taskId)
    const roundStarted = roundHasStarted(snapshot, messageIdsBeforeSend)
    if (roundStarted || Date.now() >= deadline) {
      return { taskId, title: snapshot.meta.title, status: snapshot.meta.status ?? null, mode: agentMode, roundStarted }
    }
    await sleep(START_POLL_INTERVAL_MS)
  }
}

/** 读最新一轮；waitSeconds 大于 0 时最多等这么久，做完就提前交回。mode 报代理进程实际用的模式，不报会落后的显示值 */
export async function readRound(
  services: DesktopServices,
  { workspace, taskId, waitSeconds }: { workspace: string; taskId: string; waitSeconds: number },
): Promise<RoundState & { mode: string }> {
  const deadline = Date.now() + waitSeconds * 1000
  for (;;) {
    const round = readLatestRound(await snapshotOf(services, workspace, taskId), taskId)
    if (round.roundIsOver || Date.now() >= deadline) return { ...round, mode: await agentModeOf(services, workspace, taskId) }
    await sleep(POLL_INTERVAL_MS)
  }
}
