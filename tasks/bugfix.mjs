import { cp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { checkItem, importFresh, nearlyEqual, runNodeTest } from './check-helpers.mjs'

export const title = '修 bug 跑测试'

export const prompt = [
  '当前目录是一个工具函数库，node --test 现在有测试失败。',
  '请找出 src/ 里的 bug 并修好，让 node --test 全部通过。',
  '不许修改 test/ 下的任何文件；修法要符合函数上方注释写的行为，不要针对测试用例写特判。',
  '完成后列出你修了哪些 bug。',
].join('\n')

const fixtureDir = join(import.meta.dirname, '..', 'fixtures', 'bugfix')
const testFiles = ['stats.test.js', 'text.test.js', 'duration.test.js']

export async function setup(workDir) {
  await cp(fixtureDir, workDir, { recursive: true })
}

const throws = (fn) => {
  try {
    fn()
    return '没有抛错'
  } catch {
    return true
  }
}

// 测试文件里没有的用例，用来发现针对测试特判的修法
export async function check(workDir) {
  const load = (name) => importFresh(join(workDir, 'src', name))
  return [
    await checkItem('test/ 没被改动', async () => {
      for (const name of testFiles) {
        const original = await readFile(join(fixtureDir, 'test', name), 'utf8')
        const current = await readFile(join(workDir, 'test', name), 'utf8')
        if (original !== current) return `${name} 被改了`
      }
      return true
    }),
    await checkItem('node --test 通过', async () => {
      const result = runNodeTest(workDir)
      return result.passed || result.output.slice(-300)
    }),
    await checkItem('隐藏用例 median', async () => {
      const { median } = await load('stats.js')
      const values = [100, 9, 10, 1]
      const outcome = nearlyEqual(median(values), 9.5)
      if (outcome !== true) return outcome
      return values.join() === '100,9,10,1' || '改动了输入数组'
    }),
    await checkItem('隐藏用例 percentile', async () => {
      const { percentile } = await load('stats.js')
      const values = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
      const results = [percentile(values, 50), percentile(values, 95), percentile(values, 1)]
      return results.join() === '5,10,1' || `期望 5,10,1，实际 ${results.join()}`
    }),
    await checkItem('隐藏用例 slugify', async () => {
      const { slugify } = await load('text.js')
      const result = slugify('--Already__Slug--2026!')
      return result === 'already-slug-2026' || `实际 ${result}`
    }),
    await checkItem('隐藏用例 truncate', async () => {
      const { truncate } = await load('text.js')
      const results = [truncate('abc', 3), truncate('abcdef', 1), truncate('hello world', 6)]
      return results.join('|') === 'abc|…|hello…' || `实际 ${results.join('|')}`
    }),
    await checkItem('隐藏用例 parseDuration', async () => {
      const { parseDuration } = await load('duration.js')
      const results = [parseDuration('3h'), parseDuration('10s'), parseDuration('1h1m1s')]
      if (results.join() !== '10800,10,3661') return `期望 10800,10,3661，实际 ${results.join()}`
      if (typeof parseDuration('10s') !== 'number') return '返回的不是数字'
      return throws(() => parseDuration('h'))
    }),
  ]
}
