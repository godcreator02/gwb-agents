// 只读导出那次实验用 CronCreate 建的一次性自动化及其运行记录（ZCode 桌面端的任务索引库）
// 用法：node export-automation.mjs <automationId>
import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'

const automationId = process.argv[2]
if (!automationId) throw new Error('用法：node export-automation.mjs <automationId>')

const db = new DatabaseSync(join(homedir(), '.zcode', 'v2', 'tasks-index.sqlite'), { readOnly: true })
const automation = db.prepare('SELECT * FROM automations WHERE automation_id = ?').get(automationId)
if (!automation) throw new Error(`任务索引库里没有 ${automationId}`)
const runs = db.prepare('SELECT * FROM automation_runs WHERE automation_id = ?').all(automationId)
const sidebarTasks = runs.map((run) => db.prepare('SELECT task_id, title, task_status FROM tasks WHERE task_id = ?').get(run.session_id))
console.log(JSON.stringify({ automation, runs, sidebarTasks }, null, 2))
