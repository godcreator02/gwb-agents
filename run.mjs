// 用法：node run.mjs <profile>
// 在 work/<profile>/ 里放一个文件，让 agent 读、改、跑命令，跑完检查结果。
import { query } from '@anthropic-ai/claude-agent-sdk'
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { profiles } from './profiles.mjs'

const profileName = process.argv[2]
const profile = profiles[profileName]
if (!profile) {
  throw new Error(`没有这个 profile：${profileName}。可选：${Object.keys(profiles).join(', ')}`)
}

const workDir = join(import.meta.dirname, 'work', profileName)
await rm(workDir, { recursive: true, force: true })
await mkdir(workDir, { recursive: true })
await writeFile(join(workDir, 'config.txt'), 'name = demo\nport = 8080\nmode = dev\n')

const task = [
  '在当前目录完成三步：',
  '1. 读 config.txt，告诉我 port 是多少。',
  '2. 把 port 改成 9090，其余行不动。',
  '3. 用 Bash 运行 node -e "console.log(require(\'fs\').readFileSync(\'config.txt\',\'utf8\'))" 确认改好了。',
  '最后用一句话汇报。',
].join('\n')

// 子进程不继承本机给交互式 Claude Code 配的 mods，避免它们参与实验
const { CLAUDE_CODE_PLUGIN_DIRS, ...inheritedEnv } = process.env

const toolCallNames = []
const startedAt = Date.now()
let resultMessage

for await (const message of query({
  prompt: task,
  options: {
    cwd: workDir,
    model: profile.model,
    env: { ...inheritedEnv, ...profile.env },
    settingSources: [],
    allowedTools: ['Read', 'Edit', 'Write', 'Bash'],
    permissionMode: 'acceptEdits',
    maxTurns: 12,
  },
})) {
  if (message.type === 'system' && message.subtype === 'init') {
    console.log(`[init] model=${message.model} cwd=${message.cwd}`)
  } else if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'text') console.log(`[assistant] ${block.text}`)
      if (block.type === 'tool_use') {
        toolCallNames.push(block.name)
        console.log(`[tool_use] ${block.name} ${JSON.stringify(block.input)}`)
      }
    }
  } else if (message.type === 'result') {
    resultMessage = message
  }
}

const finalConfig = await readFile(join(workDir, 'config.txt'), 'utf8')
const configEditedCorrectly = finalConfig === 'name = demo\nport = 9090\nmode = dev\n'

console.log('\n===== 汇总 =====')
console.log(`profile        ${profileName} (${profile.model})`)
console.log(`结果           ${resultMessage?.subtype}${resultMessage?.is_error ? '（出错）' : ''}`)
console.log(`轮数           ${resultMessage?.num_turns}`)
console.log(`工具调用       ${toolCallNames.join(' → ')}`)
console.log(`耗时           ${((Date.now() - startedAt) / 1000).toFixed(1)} 秒`)
console.log(`token          ${JSON.stringify(resultMessage?.usage)}`)
console.log(`费用（按 Claude 价）${resultMessage?.total_cost_usd}`)
console.log(`文件改对了吗   ${configEditedCorrectly ? '是' : '否'}`)
if (!configEditedCorrectly) {
  console.log(finalConfig)
  process.exitCode = 1
}
