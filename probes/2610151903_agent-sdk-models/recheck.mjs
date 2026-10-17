// 用法：node recheck.mjs <task> [profile…]
// 检查逻辑改了以后，对 work/<profile>/<task>/ 里已经跑完的结果重新检查，更新 results/<profile>/<task>.json，不重新调用模型。
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tasks } from './tasks/index.mjs'
import { workRoot } from './paths.mjs'

const [taskId, ...requestedProfiles] = process.argv.slice(2)
const task = tasks[taskId]
if (!task) throw new Error(`没有这个任务：${taskId}。可选：${Object.keys(tasks).join(', ')}`)

const resultsDir = join(import.meta.dirname, 'results')
const profileNames = requestedProfiles.length > 0 ? requestedProfiles : await readdir(resultsDir)

for (const profileName of profileNames) {
  const resultFile = join(resultsDir, profileName, `${taskId}.json`)
  const result = JSON.parse(await readFile(resultFile, 'utf8'))
  if (task.checkNeedsTrace && !result.toolCalls) {
    throw new Error(`${resultFile} 没存 toolCalls，这个任务的检查要用工具调用记录，只能重跑`)
  }
  const workDir = join(workRoot, profileName, taskId)
  result.checks = await task.check(workDir, { toolCalls: result.toolCalls ?? [] })
  await writeFile(resultFile, JSON.stringify(result, null, 2) + '\n')
  const passedCount = result.checks.filter((item) => item.passed).length
  console.log(`${profileName} / ${taskId}：${passedCount}/${result.checks.length}`)
}
