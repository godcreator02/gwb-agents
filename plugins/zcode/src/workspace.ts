import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { type DesktopServices, OPEN_WORKSPACE_ARGUMENT } from './desktop.js'

const execFileAsync = promisify(execFile)
const SECOND_INSTANCE_TIMEOUT_MS = 30_000
const SWITCH_POLL_INTERVAL_MS = 250
const SWITCH_TIMEOUT_MS = 10_000

export interface OpenedWorkspace {
  workspace: string
  /** false 表示窗口本来就在这个工作区，没有动 */
  switched: boolean
}

/** Windows 路径不分大小写，结尾的分隔符不算 */
export function isSameWorkspace(left: string, right: string): boolean {
  return path.win32.resolve(left).toLowerCase() === path.win32.resolve(right).toLowerCase()
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 用 ZCode 自己的启动参数把窗口切到这个工作区，再读回窗口当前的工作区核对 */
export async function openWorkspace(services: DesktopServices, workspace: string): Promise<OpenedWorkspace> {
  if (isSameWorkspace(await services.readActiveWorkspacePath(), workspace)) return { workspace, switched: false }
  try {
    await execFileAsync(services.executablePath, [OPEN_WORKSPACE_ARGUMENT, workspace], { timeout: SECOND_INSTANCE_TIMEOUT_MS, windowsHide: true })
  } catch (error) {
    throw new Error(`运行 ${services.executablePath} ${OPEN_WORKSPACE_ARGUMENT} 失败：${(error as Error).message}`)
  }
  const deadline = Date.now() + SWITCH_TIMEOUT_MS
  let activeWorkspace = await services.readActiveWorkspacePath()
  while (!isSameWorkspace(activeWorkspace, workspace)) {
    if (Date.now() >= deadline) {
      throw new Error(`已让 ZCode 打开 ${workspace}，${SWITCH_TIMEOUT_MS / 1000} 秒后窗口的工作区仍是 ${activeWorkspace}`)
    }
    await sleep(SWITCH_POLL_INTERVAL_MS)
    activeWorkspace = await services.readActiveWorkspacePath()
  }
  return { workspace, switched: true }
}
