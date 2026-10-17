import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { checkItem } from './check-helpers.mjs'

export const title = '读改跑'

export const prompt = [
  '在当前目录完成三步：',
  '1. 读 config.txt，告诉我 port 是多少。',
  '2. 把 port 改成 9090，其余行不动。',
  '3. 用 Bash 运行 node -e "console.log(require(\'fs\').readFileSync(\'config.txt\',\'utf8\'))" 确认改好了。',
  '最后用一句话汇报。',
].join('\n')

export async function setup(workDir) {
  await writeFile(join(workDir, 'config.txt'), 'name = demo\nport = 8080\nmode = dev\n')
}

export async function check(workDir) {
  return [
    await checkItem('config.txt 改对', async () =>
      (await readFile(join(workDir, 'config.txt'), 'utf8')) === 'name = demo\nport = 9090\nmode = dev\n'),
  ]
}
