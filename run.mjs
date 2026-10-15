// 用法：node --env-file-if-exists=api.txt run.mjs <profile> <task…|all>
// 每个任务在 work/<profile>/<task>/ 里重新布置初始文件，跑完自动检查，结果写进 results/<profile>/<task>.json。
import { query } from '@anthropic-ai/claude-agent-sdk'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { profiles } from './profiles.mjs'
import { tasks } from './tasks/index.mjs'
import { workRoot } from './paths.mjs'

const [profileName, ...requestedTaskIds] = process.argv.slice(2)
const buildProfile = profiles[profileName]
if (!buildProfile) {
  throw new Error(`没有这个 profile：${profileName}。可选：${Object.keys(profiles).join(', ')}`)
}
if (requestedTaskIds.length === 0) {
  throw new Error(`没给任务。可选：${Object.keys(tasks).join(', ')}，或 all`)
}
const taskIds = requestedTaskIds.includes('all') ? Object.keys(tasks) : requestedTaskIds
for (const taskId of taskIds) {
  if (!tasks[taskId]) throw new Error(`没有这个任务：${taskId}。可选：${Object.keys(tasks).join(', ')}`)
}
const profile = buildProfile()

// 子进程不继承本机给交互式 Claude Code 配的 mods，避免它们参与实验
const { CLAUDE_CODE_PLUGIN_DIRS, ...inheritedEnv } = process.env

const fileWritingTools = new Set(['Write', 'Edit', 'NotebookEdit'])

function isInsideDirectory(directory, filePath) {
  const relativePath = relative(directory, resolve(directory, filePath))
  return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

// 写文件只放行工作目录以内的路径：实测 agent 会把路径拼错写到容器根下去
function denyWritesOutside(workDir, trace) {
  return async (toolName, input) => {
    if (fileWritingTools.has(toolName) && !isInsideDirectory(workDir, String(input.file_path))) {
      trace.deniedWrites.push(input.file_path)
      console.log(`[denied] ${toolName} ${input.file_path}`)
      return { behavior: 'deny', message: `只能写 ${workDir} 以内的文件，${input.file_path} 在它外面` }
    }
    return { behavior: 'allow', updatedInput: input }
  }
}

async function runAgent(task, workDir) {
  const trace = { toolCalls: [], deniedWrites: [], resultMessage: undefined, sdkError: undefined }
  try {
    for await (const message of query({
      prompt: task.prompt,
      options: {
        cwd: workDir,
        model: profile.model,
        env: { ...inheritedEnv, ...profile.env },
        settingSources: [],
        agents: task.agents,
        // Write、Edit 不放进 allowedTools，才会经过 canUseTool 检查路径
        allowedTools: ['Read', 'Bash', 'Glob', 'Grep', 'Agent'],
        permissionMode: 'default',
        canUseTool: denyWritesOutside(workDir, trace),
        maxTurns: 40,
      },
    })) {
      if (message.type === 'system' && message.subtype === 'init') {
        console.log(`[init] model=${message.model}`)
      } else if (message.type === 'assistant') {
        const indent = message.parent_tool_use_id ? '    [子代理] ' : ''
        for (const block of message.message.content) {
          if (block.type === 'text') console.log(`${indent}[assistant] ${block.text}`)
          if (block.type === 'tool_use') {
            trace.toolCalls.push({
              name: block.name,
              input: block.input,
              parentToolUseId: message.parent_tool_use_id,
              messageId: message.message.id,
            })
            console.log(`${indent}[tool_use] ${block.name} ${JSON.stringify(block.input).slice(0, 300)}`)
          }
        }
      } else if (message.type === 'result') {
        trace.resultMessage = message
      }
    }
  } catch (error) {
    // SDK 在结果出错时抛出；记下来照常检查，接着跑下一个任务
    trace.sdkError = error.message.split('\n')[0].slice(0, 500)
    console.log(`[sdk error] ${trace.sdkError}`)
  }
  return trace
}

for (const taskId of taskIds) {
  const task = tasks[taskId]
  const workDir = join(workRoot, profileName, taskId)
  await rm(workDir, { recursive: true, force: true })
  await mkdir(workDir, { recursive: true })
  await task.setup(workDir)

  console.log(`\n===== ${profileName} / ${taskId}（${task.title}）=====`)
  const startedAt = Date.now()
  const trace = await runAgent(task, workDir)
  const durationSeconds = (Date.now() - startedAt) / 1000
  const checks = await task.check(workDir, trace)

  const result = {
    profile: profileName,
    model: profile.model,
    task: taskId,
    finishedAt: new Date().toISOString(),
    durationSeconds,
    resultSubtype: trace.resultMessage?.subtype,
    sdkError: trace.sdkError,
    numTurns: trace.resultMessage?.num_turns,
    mainToolCalls: trace.toolCalls.filter((call) => call.parentToolUseId === null).map((call) => call.name),
    subagentToolCallCount: trace.toolCalls.filter((call) => call.parentToolUseId !== null).length,
    deniedWrites: trace.deniedWrites,
    usage: trace.resultMessage?.usage,
    modelUsage: trace.resultMessage?.modelUsage,
    finalText: trace.resultMessage?.result,
    checks,
    toolCalls: trace.toolCalls,
  }
  const resultDir = join(import.meta.dirname, 'results', profileName)
  await mkdir(resultDir, { recursive: true })
  await writeFile(join(resultDir, `${taskId}.json`), JSON.stringify(result, null, 2) + '\n')

  const passedCount = checks.filter((item) => item.passed).length
  console.log(`--- 检查 ${passedCount}/${checks.length}，${durationSeconds.toFixed(1)} 秒，${result.numTurns} 轮`)
  for (const item of checks) console.log(`  ${item.passed ? '✓' : '✗'} ${item.name}${item.reason ? `：${item.reason}` : ''}`)
}
