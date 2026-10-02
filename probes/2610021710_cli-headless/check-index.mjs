// 只读查一条会话在 ZCode 的会话库与桌面端侧栏索引里各有没有
// 用法：node check-index.mjs <sessionId>
import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'

const sessionId = process.argv[2]
if (!sessionId) throw new Error('用法：node check-index.mjs <sessionId>')

const sessions = new DatabaseSync(join(homedir(), '.zcode', 'cli', 'db', 'db.sqlite'), { readOnly: true })
const sidebar = new DatabaseSync(join(homedir(), '.zcode', 'v2', 'tasks-index.sqlite'), { readOnly: true })
const session = sessions.prepare('SELECT id, title, directory FROM session WHERE id = ?').get(sessionId)
const modelSelection = sessions.prepare("SELECT data FROM session_entry WHERE session_id = ? AND type = 'runtime/model_selection'").get(sessionId)
const sidebarTask = sidebar.prepare('SELECT task_id, title, task_status, mode, model FROM tasks WHERE task_id = ?').get(sessionId)
console.log(JSON.stringify({ sessionId, inSessionDb: session ?? null, modelSelection: modelSelection?.data ?? null, inSidebarIndex: sidebarTask ?? null }, null, 2))
