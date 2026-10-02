import type { DesktopServices } from './desktop.js'
import { RUNNING_STATUS, snapshotOf } from './round.js'

export interface ArchivedTask {
  taskId: string
  title: string
  archived: true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 归档后它从侧栏的会话列表里消失，所以还在跑的不归档：归档了人就看不见它在干活。
 * archiveTask 返回的任务信息里没有 archived，读回核对用 listArchivedTasks 看这条在不在
 */
export async function archiveTask(services: DesktopServices, { workspace, taskId }: { workspace: string; taskId: string }): Promise<ArchivedTask> {
  const snapshot = await snapshotOf(services, workspace, taskId)
  if (snapshot.meta.status === RUNNING_STATUS) throw new Error(`会话 ${taskId} 还在跑，等这一轮做完（zcode.status 的 roundIsOver 为 true）再归档`)
  await services.call('zcodeTaskService', 'archiveTask', { taskId, workspacePath: workspace })
  const archivedTasks = await services.call('zcodeTaskService', 'listArchivedTasks', { workspacePath: workspace })
  if (!Array.isArray(archivedTasks)) throw new Error(`zcodeTaskService.listArchivedTasks 返回的不是数组，ZCode 内部接口可能变了`)
  if (!archivedTasks.some((task) => isRecord(task) && task['taskId'] === taskId)) {
    throw new Error(`会话 ${taskId} 调过 archiveTask 之后不在 ${workspace} 的已归档列表里`)
  }
  return { taskId, title: snapshot.meta.title, archived: true }
}
