import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAX_CONSECUTIVE_NO_RECEIPT, buildWaitCommand, describeRoundOver, parseWaitOptions, waitRound } from '../src/wait-round.js'

const OPTIONS = {
  client: 'C:\\Users\\me\\AppData\\Roaming\\gwb-kernel\\homes\\default\\node_modules\\@godcreator\\gwb-mcp\\bin\\client.mjs',
  home: 'default',
  workspace: 'D:\\repos\\论文 库',
  task: 'sess_1',
}

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')

describe('等待脚本的命令行', () => {
  it('脚本路径只用普通双引号，参数是一段不用转义的 base64url，能原样读回', () => {
    const command = buildWaitCommand('C:\\Users\\me\\gwb\\wait-round.js', { ...OPTIONS, workspace: 'D:\\a "b" $c `d\' e' })
    const match = /^node "C:\\Users\\me\\gwb\\wait-round\.js" ([A-Za-z0-9_-]+)$/.exec(command)
    expect(match).not.toBeNull()
    expect(parseWaitOptions([match![1]!])).toEqual({ ...OPTIONS, workspace: 'D:\\a "b" $c `d\' e' })
  })

  it('脚本路径里有 shell 还会展开的字符就拒绝拼', () => {
    expect(() => buildWaitCommand('C:\\$x\\wait-round.js', OPTIONS)).toThrow('拼不出命令行')
  })

  it('参数个数不对、解不出、字段多了或缺了都直接报错', () => {
    expect(() => parseWaitOptions([])).toThrow('只收一个参数')
    expect(() => parseWaitOptions(['@@'])).toThrow('不是 base64url 编码的 JSON')
    expect(() => parseWaitOptions([encode({ ...OPTIONS, mode: 'yolo' })])).toThrow('不认识的字段 mode')
    expect(() => parseWaitOptions([encode({ client: 'a', task: '' })])).toThrow('缺字段或不是非空字符串：home workspace task')
  })
})

describe('结束那一行', () => {
  it('只有一行，带状态与最后一条回答压成一行的末尾', () => {
    const line = describeRoundOver({
      taskId: 'sess_1', title: 't', status: 'completed', roundIsOver: true, mode: 'yolo', omittedReplyChars: 0,
      replies: ['第一条', `开头\n${'x'.repeat(700)}\n收尾`], fileChanges: [], pendingPermissions: [],
    })
    expect(line).not.toContain('\n')
    expect(line.startsWith('ZCODE-ROUND-OVER {')).toBe(true)
    const payload = JSON.parse(line.slice('ZCODE-ROUND-OVER '.length)) as Record<string, unknown>
    expect(payload).toMatchObject({ taskId: 'sess_1', status: 'completed', mode: 'yolo', pendingPermissions: 0 })
    expect(payload['lastReplyTail']).toMatch(/^…x+ 收尾$/)
    expect((payload['lastReplyTail'] as string).length).toBe(601)
  })
})

const FAKE_CLIENT = fileURLToPath(new URL('./fixtures/fake-mcp-client.mjs', import.meta.url))
type Step = { kind: 'no-receipt' } | { kind: 'failed-receipt'; text: string } | { kind: 'round'; roundIsOver: boolean }
const NO_RECEIPT: Step = { kind: 'no-receipt' }
const RUNNING: Step = { kind: 'round', roundIsOver: false }
const OVER: Step = { kind: 'round', roundIsOver: true }

/** 冒充的客户端把 --home 当场景目录，按 plan 依次交回结果 */
function scenario(plan: Step[]): { argv: string[]; calls(): number } {
  const dir = mkdtempSync(join(tmpdir(), 'zcode-wait-'))
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan))
  return {
    argv: [encode({ ...OPTIONS, client: FAKE_CLIENT, home: dir })],
    calls: () => Number(readFileSync(join(dir, 'calls.txt'), 'utf8')),
  }
}

// 每次查询都起一个 node 进程，一个用例最多起十来个
describe('等待中查询没交回回执', { timeout: 30_000 }, () => {
  it('客户端时限到了没交回回执，重试，等到这一轮结束', async () => {
    const { argv, calls } = scenario([NO_RECEIPT, NO_RECEIPT, RUNNING, NO_RECEIPT, OVER])
    expect(await waitRound(argv, { retryDelayMs: 0 })).toMatch(/^ZCODE-ROUND-OVER /)
    expect(calls()).toBe(5)
  })

  it('中间交回过一次回执就重新计数，不连续的失败不累加', async () => {
    const almostLimit = Array<Step>(MAX_CONSECUTIVE_NO_RECEIPT - 1).fill(NO_RECEIPT)
    const { argv } = scenario([...almostLimit, RUNNING, ...almostLimit, OVER])
    expect(await waitRound(argv, { retryDelayMs: 0 })).toMatch(/^ZCODE-ROUND-OVER /)
  })

  it(`连续 ${MAX_CONSECUTIVE_NO_RECEIPT} 次没交回回执才报错，带上最后一次的原因`, async () => {
    const { argv, calls } = scenario([NO_RECEIPT])
    await expect(waitRound(argv, { retryDelayMs: 0 })).rejects.toThrow(
      `连续 ${MAX_CONSECUTIVE_NO_RECEIPT} 次没交回回执，最后一次：TimeoutError: The operation was aborted due to timeout`,
    )
    expect(calls()).toBe(MAX_CONSECUTIVE_NO_RECEIPT)
  })

  it('zcode.status 交回了失败回执就直接报错，不重试', async () => {
    const { argv, calls } = scenario([{ kind: 'failed-receipt', text: '会话 sess_1 不存在' }, OVER])
    await expect(waitRound(argv, { retryDelayMs: 0 })).rejects.toThrow('zcode.status 失败：会话 sess_1 不存在')
    expect(calls()).toBe(1)
  })
})
