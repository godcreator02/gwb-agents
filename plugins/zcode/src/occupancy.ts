import path from 'node:path'

/**
 * 占用错误的措辞是跨插件约定（不是共享代码）：qq-bot 与协作站靠「workspace 已被会话」这个开头认出占用，
 * 收到就把任务留在队列而不是当派单失败。改动措辞要与 gwb-claudecode、gwb-qq-bot、协作站同步，
 * 约定的正本在接缝图集（uxje5-gwb-seams）的 agent 派单架构篇。
 */
export const workspaceOccupiedMessage = (holder: string): string =>
  `workspace 已被会话 ${holder} 占用：同工作区同一时间只跑一轮；先查那一轮做完没有，做完（或人工核对已停止）后再派`

/**
 * 同 workspace 同一时间只跑一轮：create / send 时登记，status 读到那一轮做完或归档时释放。
 * 表只在插件进程内存里——插件重载后是空的，第一条派单放行；跨执行端（zcode 与 claudecode）各记各的，
 * 不共表。谁看得到所有派单谁才有资格做全局互斥，见接缝图集的 agent 派单架构篇。
 */
export class WorkspaceOccupancy {
  private readonly holders = new Map<string, string>()

  private key(workspace: string): string {
    return path.resolve(workspace).toLowerCase()
  }

  holderOf(workspace: string): string | undefined {
    return this.holders.get(this.key(workspace))
  }

  /** 派这一轮之前问一句：还被别的会话占着就抛占用错误，错误信息带占用中的 taskId。同一会话续轮放行。 */
  claim(workspace: string, taskId: string): void {
    const key = this.key(workspace)
    const holder = this.holders.get(key)
    if (holder !== undefined && holder !== taskId) throw new Error(workspaceOccupiedMessage(holder))
    this.holders.set(key, taskId)
  }

  /** 那一轮做完了（或归档、或人工核对了）就放开；不是这个会话占着的调用照常返回。 */
  release(workspace: string, taskId: string): void {
    const key = this.key(workspace)
    if (this.holders.get(key) === taskId) this.holders.delete(key)
  }
}
