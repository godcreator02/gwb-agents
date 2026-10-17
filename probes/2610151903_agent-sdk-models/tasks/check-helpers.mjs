import { spawnSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

// 每次检查都要读到 agent 改过之后的文件，所以 import 时加时间戳绕开模块缓存
export function importFresh(file) {
  return import(`${pathToFileURL(file).href}?t=${Date.now()}`)
}

export function runNodeTest(dir) {
  const result = spawnSync(process.execPath, ['--test'], { cwd: dir, encoding: 'utf8', timeout: 60_000 })
  return { passed: result.status === 0, output: `${result.stdout}${result.stderr}` }
}

export async function listFilesRecursively(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && !entry.parentPath.includes('node_modules'))
    .map((entry) => join(entry.parentPath, entry.name))
}

export async function filesContaining(dir, text) {
  const matches = []
  for (const file of await listFilesRecursively(dir)) {
    if ((await readFile(file, 'utf8')).includes(text)) matches.push(relative(dir, file))
  }
  return matches
}

// 单条检查：fn 返回 true 算通过，返回字符串或抛错算失败并记下原因
export async function checkItem(name, fn) {
  try {
    const outcome = await fn()
    if (outcome === true) return { name, passed: true }
    return { name, passed: false, reason: String(outcome) }
  } catch (error) {
    return { name, passed: false, reason: error.message.split('\n')[0] }
  }
}

export function nearlyEqual(actual, expected) {
  return Math.abs(actual - expected) < 1e-9 ? true : `期望 ${expected}，实际 ${actual}`
}
