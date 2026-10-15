// 用法：node probe.mjs <SDK 包目录>
// 从一个不在任何 node_modules 链上的位置，按文件路径动态 import SDK，跑一轮不带工具的最小对话
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const sdkDir = process.argv[2]
if (!sdkDir) throw new Error('给 SDK 包目录，如 %APPDATA%\\npm\\node_modules\\@anthropic-ai\\claude-agent-sdk')

const manifest = JSON.parse(await readFile(join(sdkDir, 'package.json'), 'utf8'))
console.log(`SDK ${manifest.version}，配套 Claude Code ${manifest.claudeCodeVersion}`)

const sdk = await import(pathToFileURL(join(sdkDir, 'sdk.mjs')).href)
console.log(`导出：${Object.keys(sdk).filter((name) => ['query', 'AbortError'].includes(name)).join(', ')}`)

const { CLAUDE_CODE_PLUGIN_DIRS, ...env } = process.env
const startedAt = Date.now()
for await (const message of sdk.query({
  prompt: '只回答两个字母：ok',
  options: { cwd: process.cwd(), env, settingSources: [], tools: [], maxTurns: 1 },
})) {
  if (message.type === 'system' && message.subtype === 'init') {
    console.log(`init：model=${message.model} claude_code_version=${message.claude_code_version}`)
  }
  if (message.type === 'result') {
    console.log(`result：subtype=${message.subtype} is_error=${message.is_error} 文本=${JSON.stringify(message.result)} 耗时=${Date.now() - startedAt}ms`)
  }
}
