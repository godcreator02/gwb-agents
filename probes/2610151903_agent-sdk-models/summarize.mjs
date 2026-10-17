// 用法：node summarize.mjs
// 读 results/<profile>/<task>.json，打印一张 Markdown 对比表和每个没通过的检查项。
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tasks } from './tasks/index.mjs'

const resultsDir = join(import.meta.dirname, 'results')
const results = []
for (const profileName of await readdir(resultsDir)) {
  for (const file of await readdir(join(resultsDir, profileName))) {
    results.push(JSON.parse(await readFile(join(resultsDir, profileName, file), 'utf8')))
  }
}

const taskOrder = Object.keys(tasks)
results.sort((a, b) => taskOrder.indexOf(a.task) - taskOrder.indexOf(b.task) || a.profile.localeCompare(b.profile))

function totalInputTokens(usage) {
  if (!usage) return '-'
  return usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens
}

console.log('| 任务 | 模型 | 检查通过 | 轮数 | 主代理工具调用 | 子代理工具调用 | 越界写入被拒 | 耗时（秒） | 输入 token | 输出 token |')
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const result of results) {
  const passedCount = result.checks.filter((item) => item.passed).length
  console.log([
    '',
    `${result.task}（${tasks[result.task].title}）`,
    result.model,
    `${passedCount}/${result.checks.length}`,
    result.numTurns ?? '-',
    result.mainToolCalls.length,
    result.subagentToolCallCount,
    result.deniedWrites.length,
    result.durationSeconds.toFixed(0),
    totalInputTokens(result.usage),
    result.usage?.output_tokens ?? '-',
    '',
  ].join(' | ').trim())
}

console.log('\n没通过的检查：\n')
for (const result of results) {
  for (const item of result.checks.filter((check) => !check.passed)) {
    console.log(`* ${result.task} / ${result.model}：${item.name}——${item.reason}`)
  }
  if (result.sdkError) console.log(`* ${result.task} / ${result.model}：SDK 报错——${result.sdkError}`)
}
