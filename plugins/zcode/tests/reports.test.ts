import { describe, expect, it, vi } from 'vitest'
import { ReportBook, parseReportTarget } from '../src/reports.js'

function setup() {
  let doc: unknown
  const deliver = vi.fn(async () => ({ ok: true }))
  const deps = { home: 'test-b', read: async () => structuredClone(doc), write: async (value: unknown) => { doc = structuredClone(value) }, deliver, warn: vi.fn() }
  return { deps, deliver, book: new ReportBook(deps) }
}
const target = { id: 'round-1', callback: 'test.receive', server: 'gwb_botb' }
describe('主动回报', () => {
  it('指定 home 和工具服务，结果落盘后推送；同票并发重交只交付一次', async () => {
    const { book, deliver } = setup()
    const ticket = await book.prepare(target, 'D:/test', 'sess_one')
    expect(book.prompt('测试', target, ticket)).toContain('MCP 服务名=gwb_botb')
    const report = { ticket, state: 'completed', text: '完成' }
    await Promise.all([book.report(report), book.report(report)])
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(deliver.mock.calls[0]).toEqual(['test.receive', expect.objectContaining({ id: 'round-1', taskId: 'sess_one', text: '完成' })])
    await expect(book.report({ ...report, text: '替换' })).rejects.toThrow('不能覆盖')
    await expect(book.report(report)).resolves.toMatchObject({ recorded: true, accepted: true, duplicate: true })
  })
  it('接收方卸载期间保留结果，重建后只补交未接收项', async () => {
    const { book, deps, deliver } = setup()
    deliver.mockResolvedValueOnce({ ok: false })
    const ticket = await book.prepare(target, 'D:/test', 'sess_one')
    await expect(book.report({ ticket, state: 'needs_input', text: '哪个文件？' })).resolves.toMatchObject({ recorded: true, accepted: false })
    const restored = new ReportBook(deps)
    await restored.replay('test.receive')
    await restored.replay('test.receive')
    expect(deliver).toHaveBeenCalledTimes(2)
  })
  it('其他 home 的 ticket 和相同派单 id 被拒，拒绝不损坏后续回报', async () => {
    const { book } = setup()
    const ticket = await book.prepare(target, 'D:/test', 'sess_one')
    await expect(book.report({ ticket: 'wrong-home', state: 'completed', text: '错' })).rejects.toThrow('本 home')
    await expect(book.prepare(target, 'D:/test', 'sess_two')).rejects.toThrow('已存在')
    await expect(book.report({ ticket, state: 'completed', text: '对' })).resolves.toMatchObject({ accepted: true })
    expect(() => parseReportTarget({ ...target, extra: 'x' })).toThrow('只接受')
  })
})
