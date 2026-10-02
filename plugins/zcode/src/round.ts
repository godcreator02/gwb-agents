import type { DesktopTaskService } from './desktop.js'
import { FULL_ACCESS_MODE, type RoundOutcome, assistantMessageIds, judgeRound, readSnapshot } from './task-progress.js'

const POLL_INTERVAL_MS = 2000
const SNAPSHOT_MESSAGE_LIMIT = 50
const CLIENT_MODE = 'desktop-continuous'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function snapshotOf(taskService: DesktopTaskService, workspace: string, taskId: string) {
  const raw = await taskService.call('getTaskSnapshot', { workspacePath: workspace, taskId, messageLimit: SNAPSHOT_MESSAGE_LIMIT, clientMode: CLIENT_MODE })
  return readSnapshot(raw, taskId)
}

export async function createTask(taskService: DesktopTaskService, workspace: string): Promise<string> {
  const created = (await taskService.call('createTask', { workspacePath: workspace, v4Create: true })) as { taskId?: unknown }
  if (typeof created.taskId !== 'string') throw new Error(`zcodeTaskService.createTask 没回 taskId：${JSON.stringify(created)}`)
  return created.taskId
}

/** 切完读回核对，没切成就不发指令 */
async function switchToFullAccess(taskService: DesktopTaskService, workspace: string, taskId: string): Promise<void> {
  await taskService.call('setMode', { taskId, mode: FULL_ACCESS_MODE })
  const mode = (await snapshotOf(taskService, workspace, taskId)).meta.mode
  if (mode !== FULL_ACCESS_MODE) {
    throw new Error(`会话 ${taskId} 切换到完全访问（${FULL_ACCESS_MODE}）后读回的模式是 ${mode}，已停止，指令没有发出`)
  }
}

export async function sendRoundAndWait(
  taskService: DesktopTaskService,
  { workspace, taskId, prompt, timeoutSeconds }: { workspace: string; taskId: string; prompt: string; timeoutSeconds: number },
): Promise<RoundOutcome> {
  await switchToFullAccess(taskService, workspace, taskId)
  const assistantIdsBeforeSend = assistantMessageIds(await snapshotOf(taskService, workspace, taskId))
  await taskService.call('sendPrompt', {
    taskId,
    content: prompt,
    traceId: crypto.randomUUID(),
    queryId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    clientMode: CLIENT_MODE,
  })
  const deadline = Date.now() + timeoutSeconds * 1000
  for (;;) {
    const { roundIsOver, outcome } = judgeRound(await snapshotOf(taskService, workspace, taskId), taskId, assistantIdsBeforeSend)
    if (roundIsOver) return outcome
    if (Date.now() >= deadline) return { ...outcome, timedOut: true }
    await sleep(POLL_INTERVAL_MS)
  }
}
