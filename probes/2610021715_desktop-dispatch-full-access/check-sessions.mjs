// 只读查几条会话在桌面端侧栏索引里的标题、状态、模式，以及会话库里记的执行模式
// 用法：node check-sessions.mjs <sessionId…>
import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'

const sessionIds = process.argv.slice(2)
if (sessionIds.length === 0) throw new Error('用法：node check-sessions.mjs <sessionId…>')

const sessions = new DatabaseSync(join(homedir(), '.zcode', 'cli', 'db', 'db.sqlite'), { readOnly: true })
const sidebar = new DatabaseSync(join(homedir(), '.zcode', 'v2', 'tasks-index.sqlite'), { readOnly: true })
for (const sessionId of sessionIds) {
  const sidebarTask = sidebar.prepare('SELECT title, task_status, mode, model FROM tasks WHERE task_id = ?').get(sessionId)
  const executionState = sessions.prepare("SELECT data FROM session_entry WHERE session_id = ? AND type = 'runtime/execution_state'").get(sessionId)
  console.log(JSON.stringify({ sessionId, inSidebarIndex: sidebarTask ?? null, executionState: executionState?.data ?? null }))
}
