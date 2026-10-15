import { describe, expect, it, vi } from 'vitest'
import { endProcessTree, readPersistentVariableNames, spawnClaudeCode } from '../src/claude-process.js'

/** 像 Claude Code 用 Bash 开命令那样：子进程再开一个长命令，把它的 pid 写到 stdout */
const parentWithLongCommand = "const c=require('child_process').spawn('ping',['-n','60','127.0.0.1'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000)"

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('Claude Code 进程', () => {
  it('结束进程树时连它开的命令一起结束；进程已经退出不算错', async () => {
    const child = spawnClaudeCode({ command: process.execPath, args: ['-e', parentWithLongCommand], env: process.env, signal: new AbortController().signal })
    const grandchildPid = await new Promise<number>((resolve) => child.stdout!.once('data', (chunk: Buffer) => resolve(Number(chunk.toString().trim()))))
    expect(isAlive(grandchildPid)).toBe(true)
    await endProcessTree(child.pid!)
    await vi.waitFor(() => expect(isAlive(grandchildPid)).toBe(false))
    await expect(endProcessTree(child.pid!)).resolves.toBeUndefined()
  })

  it('读出 Windows 长期环境变量的名字（大写）', async () => {
    expect(await readPersistentVariableNames()).toContain('PATH')
  })
})
