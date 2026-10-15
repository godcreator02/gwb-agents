import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import type { SdkSpawnOptions } from './sdk-types.js'

const execFileAsync = promisify(execFile)

/**
 * 照 SDK 自己启动 Claude Code 的方式启动，只是 stderr 不收（SDK 默认要收，自己启动时不读会塞满管道卡住子进程）。
 * 自己启动是为了拿到 pid：打断时要连 Claude Code 在后台开的命令一起结束，见 endProcessTree
 */
export function spawnClaudeCode({ command, args, cwd, env, signal }: SdkSpawnOptions): ChildProcess {
  return spawn(command, args, { cwd, env, signal, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
}

/** taskkill 找不到这个进程时的退出码：进程已经自己退出了 */
const TASKKILL_PROCESS_NOT_FOUND = 128

/**
 * Windows 上结束一个进程不会连带结束它开的子进程；SDK 的 close() 超时后只强制结束 claude.exe，
 * 它用 Bash、Monitor 开的命令会留下来接着跑。所以先按进程树整棵结束
 */
export async function endProcessTree(pid: number): Promise<void> {
  try {
    await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === TASKKILL_PROCESS_NOT_FOUND) return
    throw new Error(`结束 Claude Code 进程树（pid ${pid}）失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

const PERSISTENT_ENVIRONMENT_KEYS = [
  'HKCU\\Environment',
  'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
]

/** reg query 每个值一行：四个空格、名字、四个空格、类型、四个空格、值 */
const registryValueLine = /^ {4}(.+?) {4}REG_[A-Z_]+(?: {4}|$)/u

/** Windows 用户级与系统级长期环境变量的名字（大写），即用户自己设的、不是哪个进程临时塞给工作台的 */
export async function readPersistentVariableNames(): Promise<Set<string>> {
  const names = new Set<string>()
  for (const key of PERSISTENT_ENVIRONMENT_KEYS) {
    const { stdout } = await execFileAsync('reg', ['query', key], { windowsHide: true })
    for (const line of stdout.split(/\r?\n/u)) {
      const match = registryValueLine.exec(line)
      if (match !== null) names.add(match[1]!.toUpperCase())
    }
  }
  return names
}
