import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import type { ZcodeRoundStatus } from './api.js'

/**
 * 等 ZCode 一个会话的最新一轮结束，给 Claude Code 的 Monitor 当事件源（产物 dist/wait-round.js）。
 * Monitor 把标准输出的每一行当一次通知，所以等的过程中不打任何东西：结束打一行 ROUND_OVER_PREFIX，出错打一行 WAIT_FAILED_PREFIX，然后退出。
 */

const execFileAsync = promisify(execFile)
/** 单次 zcode.status 等的秒数；客户端的 HTTP 时限比它长，留出回执余量 */
const STATUS_WAIT_SECONDS = 120
const CLIENT_TIMEOUT_MS = (STATUS_WAIT_SECONDS + 30) * 1000
/** 结束那一行只带最后一条回答的末尾，完整回答由调用方再调 zcode.status 读 */
const REPLY_TAIL_CHARS = 600
export const ROUND_OVER_PREFIX = 'ZCODE-ROUND-OVER'
export const WAIT_FAILED_PREFIX = 'ZCODE-WAIT-FAILED'

const OPTION_NAMES = ['client', 'home', 'workspace', 'task'] as const
/** client 是 gwb-mcp 的 bin/client.mjs，home 是 home 名，workspace 与 task 同 zcode.status */
export type WaitOptions = Record<(typeof OPTION_NAMES)[number], string>

/** 双引号里 bash 与 pwsh 都还会展开的字符；脚本路径在 home 目录下，有这些字符就拼不出两边通用的命令行 */
const SHELL_EXPANDED_CHARACTERS = /["$`]/

/**
 * 交给 Monitor 的命令行。Monitor 可能用 bash 也可能用 pwsh 运行它：脚本路径只用普通双引号括起来（两边都原样保留反斜杠），
 * 参数整个编成一段 base64url（只有字母、数字、- 与 _），工作区路径里有什么字符都不用转义
 */
export function buildWaitCommand(scriptPath: string, options: WaitOptions): string {
  if (SHELL_EXPANDED_CHARACTERS.test(scriptPath)) throw new Error(`等待脚本的路径里有 " $ \` 之一，拼不出命令行：${scriptPath}`)
  return `node "${scriptPath}" ${Buffer.from(JSON.stringify(options)).toString('base64url')}`
}

export function parseWaitOptions(argv: string[]): WaitOptions {
  if (argv.length !== 1 || argv[0] === undefined) throw new Error(`只收一个参数（zcode.create / send 回执 waitCommand 里那段 base64url），实际 ${argv.length} 个`)
  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(argv[0], 'base64url').toString('utf8'))
  } catch {
    throw new Error(`参数不是 base64url 编码的 JSON：${argv[0]}`)
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) throw new Error('参数解出来不是对象')
  const entries = Object.entries(decoded)
  const unknownNames = entries.map(([name]) => name).filter((name) => !(OPTION_NAMES as readonly string[]).includes(name))
  if (unknownNames.length > 0) throw new Error(`不认识的字段 ${unknownNames.join(' ')}，只收 ${OPTION_NAMES.join(' ')}`)
  const options = decoded as Partial<Record<string, unknown>>
  const missing = OPTION_NAMES.filter((name) => typeof options[name] !== 'string' || options[name] === '')
  if (missing.length > 0) throw new Error(`缺字段或不是非空字符串：${missing.join(' ')}`)
  return options as WaitOptions
}

export function describeRoundOver(round: ZcodeRoundStatus): string {
  const lastReply = round.replies.at(-1) ?? ''
  const tail = lastReply.length > REPLY_TAIL_CHARS ? `…${lastReply.slice(-REPLY_TAIL_CHARS)}` : lastReply
  return `${ROUND_OVER_PREFIX} ${JSON.stringify({
    taskId: round.taskId,
    status: round.status,
    mode: round.mode,
    pendingPermissions: round.pendingPermissions.length,
    lastReplyTail: tail.replace(/\s+/g, ' ').trim(),
  })}`
}

async function readStatus({ client, home, workspace, task }: WaitOptions): Promise<ZcodeRoundStatus> {
  const statusArgs = JSON.stringify({ workspace, task, waitSeconds: STATUS_WAIT_SECONDS, replyTailChars: REPLY_TAIL_CHARS })
  let stdout: string
  try {
    ;({ stdout } = await execFileAsync(
      process.execPath,
      [client, '--home', home, '--timeout', String(CLIENT_TIMEOUT_MS), 'run', 'zcode.status', statusArgs],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
    ))
  } catch (error) {
    const { stdout: out = '', stderr = '' } = error as { stdout?: string; stderr?: string }
    throw new Error(`zcode.status 失败：${`${out}${stderr}`.trim() || (error as Error).message}`)
  }
  const receipt = JSON.parse(stdout) as { ok?: unknown; data?: ZcodeRoundStatus }
  if (receipt.ok !== true || receipt.data === undefined) throw new Error(`zcode.status 失败：${stdout.trim()}`)
  return receipt.data
}

/** 一直等到这一轮结束；每次 zcode.status 最多等 STATUS_WAIT_SECONDS 秒，没结束就再问 */
export async function waitRound(argv: string[]): Promise<string> {
  const options = parseWaitOptions(argv)
  if (!existsSync(options.client)) throw new Error(`找不到 gwb-mcp 的命令行客户端 ${options.client}：这个 home 没装 @godcreator/gwb-mcp`)
  for (;;) {
    const round = await readStatus(options)
    if (round.roundIsOver) return describeRoundOver(round)
  }
}
