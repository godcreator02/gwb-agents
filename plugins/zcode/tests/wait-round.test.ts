import { describe, expect, it } from 'vitest'
import { buildWaitCommand, describeRoundOver, parseWaitOptions } from '../src/wait-round.js'

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
