import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { checkItem } from './check-helpers.mjs'

export const title = '子代理并行统计'

// check 要用运行时记下的工具调用（派了几个子代理、主代理读没读日志）
export const checkNeedsTrace = true

const logFileNames = ['service-a.log', 'service-b.log', 'service-c.log']

export const prompt = [
  'logs/ 下有三个日志文件：service-a.log、service-b.log、service-c.log。每行格式是「时间 级别 消息」，级别是第二个字段，取值 DEBUG / INFO / WARN / ERROR。',
  '请用 Agent 工具给每个文件各派一个 log-counter 子代理，三个在同一条回复里一起派出，让它们并行统计。你自己不要读日志文件。',
  '每个子代理统计它那个文件里各级别的行数，以及级别为 ERROR 的行里出现次数最多的消息。',
  '拿到三份结果后，在当前目录写 report.json，格式：',
  '{"service-a.log": {"DEBUG": 0, "INFO": 0, "WARN": 0, "ERROR": 0, "topError": "消息原文"}, "service-b.log": {...}, "service-c.log": {...}}',
  '最后用一句话汇报。',
].join('\n')

export const agents = {
  'log-counter': {
    description: '统计一个日志文件里各级别的行数，以及出现次数最多的 ERROR 消息',
    prompt: '你负责分析一个日志文件。每行格式是「时间 级别 消息」，级别是按空格分开的第二个字段。消息里也可能出现 ERROR、WARN 这样的词，那不算级别。统计各级别的行数，找出级别为 ERROR 的行里出现次数最多的消息原文。只回一段 JSON：{"DEBUG": n, "INFO": n, "WARN": n, "ERROR": n, "topError": "..."}。',
    tools: ['Read', 'Grep', 'Bash'],
  },
}

// 固定种子的伪随机数，保证每次生成的日志一样
function seededRandom(seed) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

function pickWeighted(random, weightedChoices) {
  const total = weightedChoices.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [value, weight] of weightedChoices) {
    roll -= weight
    if (roll < 0) return value
  }
  return weightedChoices.at(-1)[0]
}

const serviceProfiles = [
  { seed: 11, errors: [['db timeout', 9], ['cache miss storm', 4], ['disk full', 2]] },
  { seed: 23, errors: [['upstream 502', 3], ['token expired', 8], ['db timeout', 5]] },
  { seed: 37, errors: [['queue overflow', 6], ['upstream 502', 11], ['oom killed', 2]] },
]

// 故意放进消息里含级别词的行，单纯 grep -c ERROR 会数错
const infoMessages = ['request ok', 'retry after ERROR in upstream', 'user login', 'cache warm', 'WARN threshold reset']
const warnMessages = ['slow query', 'high latency', 'ERROR budget at 80%']
const debugMessages = ['payload size', 'span closed', 'ERROR handler registered']

function generateLog({ seed, errors }) {
  const random = seededRandom(seed)
  const lines = []
  const start = Date.UTC(2026, 9, 1, 8, 0, 0)
  for (let i = 0; i < 400; i++) {
    const level = pickWeighted(random, [['DEBUG', 4], ['INFO', 10], ['WARN', 3], ['ERROR', 2]])
    const messages = { DEBUG: debugMessages, INFO: infoMessages, WARN: warnMessages }[level]
    const message = level === 'ERROR'
      ? pickWeighted(random, errors)
      : messages[Math.floor(random() * messages.length)]
    const time = new Date(start + i * 7_000).toISOString().replace('.000Z', 'Z')
    lines.push(`${time} ${level} ${message}`)
  }
  return lines.join('\n') + '\n'
}

export async function setup(workDir) {
  await mkdir(join(workDir, 'logs'))
  for (const [index, name] of logFileNames.entries()) {
    await writeFile(join(workDir, 'logs', name), generateLog(serviceProfiles[index]))
  }
}

function expectedSummary(logText) {
  const counts = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 }
  const errorMessageCounts = new Map()
  for (const line of logText.trim().split('\n')) {
    const [, level, ...messageWords] = line.split(' ')
    counts[level]++
    if (level === 'ERROR') {
      const message = messageWords.join(' ')
      errorMessageCounts.set(message, (errorMessageCounts.get(message) ?? 0) + 1)
    }
  }
  const topCount = Math.max(...errorMessageCounts.values())
  const topErrors = [...errorMessageCounts].filter(([, count]) => count === topCount).map(([message]) => message)
  return { counts, topErrors }
}

const touchesLogs = (toolCall) => JSON.stringify(toolCall.input).includes('logs')

export async function check(workDir, trace) {
  const agentCalls = trace.toolCalls.filter((call) => call.name === 'Agent' && call.parentToolUseId === null)
  const report = await readFile(join(workDir, 'report.json'), 'utf8').then(JSON.parse).catch((error) => error)

  const items = [
    await checkItem('派了三个 log-counter 子代理', async () => {
      const counterCalls = agentCalls.filter((call) => call.input.subagent_type === 'log-counter')
      return counterCalls.length === 3 || `Agent 调用 ${agentCalls.length} 次，其中 log-counter ${counterCalls.length} 次`
    }),
    await checkItem('三个子代理在同一条回复里派出', async () => {
      const messageIds = new Set(agentCalls.map((call) => call.messageId))
      return (agentCalls.length >= 3 && messageIds.size === 1) || `分散在 ${messageIds.size} 条回复里`
    }),
    await checkItem('主代理没有自己读日志', async () => {
      const mainThreadLogReads = trace.toolCalls.filter((call) =>
        call.parentToolUseId === null && call.name !== 'Agent' && touchesLogs(call))
      return mainThreadLogReads.length === 0 || `主代理调用了 ${mainThreadLogReads.map((call) => call.name).join(', ')}`
    }),
    await checkItem('report.json 可解析', async () => !(report instanceof Error) || report.message),
  ]

  for (const name of logFileNames) {
    items.push(await checkItem(`${name} 统计正确`, async () => {
      if (report instanceof Error) return '没有 report.json'
      const actual = report[name]
      if (!actual) return '缺这一项'
      const { counts, topErrors } = expectedSummary(await readFile(join(workDir, 'logs', name), 'utf8'))
      const wrongLevels = Object.entries(counts).filter(([level, count]) => actual[level] !== count)
      if (wrongLevels.length > 0) {
        return wrongLevels.map(([level, count]) => `${level} 应为 ${count}，写的是 ${actual[level]}`).join('；')
      }
      return topErrors.includes(actual.topError) || `topError 应为 ${topErrors.join(' 或 ')}，写的是 ${actual.topError}`
    }))
  }
  return items
}
