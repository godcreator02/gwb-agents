import type { DesktopServices } from './desktop.js'
import { FULL_ACCESS_MODE, type RoundOutcome, judgeRound, messageIds, readAgentMode, readSnapshot } from './task-progress.js'

const POLL_INTERVAL_MS = 2000
const SNAPSHOT_MESSAGE_LIMIT = 50
const CLIENT_MODE = 'desktop-continuous'
const ASK_BEFORE_CHANGES_MODE = 'build'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function snapshotOf(services: DesktopServices, workspace: string, taskId: string) {
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
 * 代理进程的模式真的变了，ZCode 才更新任务的 meta.mode（侧栏与界面显示的那个）。新会话会继承这个工作区上次用的模式，
 * 继承到 yolo 时代理按 yolo 跑、界面却显示「变更前确认」，这时先切 build 再切 yolo 让显示跟上；只有没跑过的新会话会这样，
 * 碰不到正在跑的一轮（跑着的时候切到 build，这一瞬间的工具调用会停下等确认）。切完两处都读回核对，有一处不是 yolo 就不发指令
 */
async function switchToFullAccess(services: DesktopServices, workspace: string, taskId: string): Promise<void> {
  // 先读快照：它会让 ZCode 恢复这条会话，之后 readSession 才读得到
  const displayedModeBefore = (await snapshotOf(services, workspace, taskId)).meta.mode
  const agentModeBefore = await agentModeOf(services, workspace, taskId)
  if (agentModeBefore !== FULL_ACCESS_MODE) {
    await services.call('zcodeTaskService', 'setMode', { taskId, mode: FULL_ACCESS_MODE })
  } else if (displayedModeBefore !== FULL_ACCESS_MODE) {
    await services.call('zcodeTaskService', 'setMode', { taskId, mode: ASK_BEFORE_CHANGES_MODE })
    await services.call('zcodeTaskService', 'setMode', { taskId, mode: FULL_ACCESS_MODE })
  }
  const agentMode = await agentModeOf(services, workspace, taskId)
  const displayedMode = (await snapshotOf(services, workspace, taskId)).meta.mode
  if (agentMode !== FULL_ACCESS_MODE || displayedMode !== FULL_ACCESS_MODE) {
    throw new Error(
      `会话 ${taskId} 切换到完全访问（${FULL_ACCESS_MODE}）后读回的模式：代理 ${agentMode}、界面 ${displayedMode}，已停止，指令没有发出`,
    )
  }
}

export async function sendRoundAndWait(
  services: DesktopServices,
  { workspace, taskId, prompt, timeoutSeconds }: { workspace: string; taskId: string; prompt: string; timeoutSeconds: number },
): Promise<RoundOutcome> {
  await switchToFullAccess(services, workspace, taskId)
  const messageIdsBeforeSend = messageIds(await snapshotOf(services, workspace, taskId))
  await services.call('zcodeTaskService', 'sendPrompt', {
    taskId,
    content: prompt,
    traceId: crypto.randomUUID(),
    queryId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    clientMode: CLIENT_MODE,
  })
  const deadline = Date.now() + timeoutSeconds * 1000
  for (;;) {
    const { roundIsOver, outcome } = judgeRound(await snapshotOf(services, workspace, taskId), taskId, messageIdsBeforeSend)
    if (roundIsOver) return outcome
    if (Date.now() >= deadline) return { ...outcome, timedOut: true }
    await sleep(POLL_INTERVAL_MS)
  }
}
