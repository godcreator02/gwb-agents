// 只读导出那次 Codex 会话里用户与助手说的话（不导出工具调用与输出）
// 用法：node export-codex-session.mjs <rollout 文件>
import { readFileSync } from 'node:fs'

const rolloutFile = process.argv[2]
if (!rolloutFile) throw new Error('用法：node export-codex-session.mjs <~/.codex/sessions/.../rollout-*.jsonl>')

let previous = ''
for (const line of readFileSync(rolloutFile, 'utf8').split('\n')) {
  if (line.trim() === '') continue
  const payload = JSON.parse(line).payload ?? {}
  let entry
  if (payload.type === 'message' && payload.role === 'user') {
    const text = (payload.content ?? []).map((c) => c.text ?? '').join('')
    if (!text.startsWith('<') && !text.includes('AGENTS.md instructions')) entry = `## 用户\n${text}`
  } else if (payload.type === 'message' && payload.role === 'assistant') {
    entry = `## 助手\n${(payload.content ?? []).map((c) => c.text ?? '').join('')}`
  }
  if (entry !== undefined && entry !== previous) console.log(entry + '\n')
  if (entry !== undefined) previous = entry
}
