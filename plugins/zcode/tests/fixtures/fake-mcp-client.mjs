// 冒充 gwb-mcp 的 bin/client.mjs，给 wait-round 的测试用。等待脚本传来的 --home 当成场景目录：
// 目录里 plan.json 是每次调用依次的结果，calls.txt 记已经调了几次，用完了就一直重复最后一项。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[process.argv.indexOf('--home') + 1]
const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'))
const callsFile = join(dir, 'calls.txt')
const calls = existsSync(callsFile) ? Number(readFileSync(callsFile, 'utf8')) : 0
writeFileSync(callsFile, String(calls + 1))
const step = plan[Math.min(calls, plan.length - 1)]

if (step.kind === 'no-receipt') {
  // 同真客户端：读响应体时被 --timeout 中止，main().catch 把 String(err) 写进 stderr
  process.stderr.write('TimeoutError: The operation was aborted due to timeout\n')
  process.exitCode = 1
} else if (step.kind === 'failed-receipt') {
  // 同真客户端：命令失败的回执文本写进 stdout，退出码 1
  process.stdout.write(`${step.text}\n`)
  process.exitCode = 1
} else {
  const round = {
    taskId: 'sess_1', title: 't', status: step.roundIsOver ? 'completed' : 'running', roundIsOver: step.roundIsOver,
    mode: 'yolo', omittedReplyChars: 0, replies: ['做完了'], fileChanges: [], pendingPermissions: [],
  }
  process.stdout.write(`${JSON.stringify({ ok: true, data: round })}\n`)
}
