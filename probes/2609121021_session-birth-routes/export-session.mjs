// 只读导出 zcode 会话库里一条会话的对话文字与工具名（不导出工具参数：那次会话写过带 apiKey 的配置文件）
// 用法：node export-session.mjs <sessionId>
import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'

const sessionId = process.argv[2]
if (!sessionId) throw new Error('用法：node export-session.mjs <sessionId>')

const db = new DatabaseSync(join(homedir(), '.zcode', 'cli', 'db', 'db.sqlite'), { readOnly: true })
const session = db.prepare('SELECT id, title, directory, time_created FROM session WHERE id = ?').get(sessionId)
if (!session) throw new Error(`会话库里没有 ${sessionId}`)
console.log(`# ${session.title}\n会话 ${session.id}，目录 ${session.directory}，建于 ${new Date(session.time_created).toISOString()}\n`)

const rows = db
  .prepare('SELECT m.data AS message, p.data AS part FROM message m JOIN part p ON p.message_id = m.id WHERE m.session_id = ? ORDER BY m.sequence, p.sequence')
  .all(sessionId)
for (const row of rows) {
  const role = JSON.parse(row.message).role
  const part = JSON.parse(row.part)
  if (part.type === 'text') console.log(`## ${role}\n${part.text}\n`)
  else if (part.type === 'tool') console.log(`（${role} 调用工具 ${part.tool ?? part.name}）\n`)
}
