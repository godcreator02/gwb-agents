import { describe, expect, it } from 'vitest'
import { isWorkspaceOccupied, parseReport, sameOutcome, workspaceOccupiedMessage } from '../src/index.js'

const ticket = 'a'.repeat(64)
const report = { ticket, state: 'completed' as const, text: '做完了' }

describe('parseReport', () => {
  it('形状齐全时原样交回', () => {
    expect(parseReport(report)).toEqual(report)
  })
  it('多余的键、坏票据、坏 state、空正文、超长正文都拒绝', () => {
    expect(() => parseReport({ ...report, extra: 1 })).toThrow('回报参数应为')
    expect(() => parseReport({ ...report, ticket: 'xyz' })).toThrow('64 位十六进制')
    expect(() => parseReport({ ...report, state: 'ok' })).toThrow('state 只能是')
    expect(() => parseReport({ ...report, text: '' })).toThrow('text 应是')
    expect(() => parseReport({ ...report, text: 'x'.repeat(16001) })).toThrow('text 应是')
  })
  it('正文含票据时拒绝（凭证不外泄）', () => {
    expect(() => parseReport({ ...report, text: `结果里带 ${ticket}` })).toThrow('不能包含回报凭证')
  })
})

describe('sameOutcome', () => {
  it('state 与 text 都相同才算同一结果', () => {
    expect(sameOutcome(report, { ...report })).toBe(true)
    expect(sameOutcome(report, { ...report, text: '换了' })).toBe(false)
    expect(sameOutcome(report, { ...report, state: 'failed' as const })).toBe(false)
  })
})

describe('workspace 占用错误', () => {
  it('措辞可判定：消息来自工厂的都能认出，别的错误不误认', () => {
    const message = workspaceOccupiedMessage('sess_1')
    expect(isWorkspaceOccupied(message)).toBe(true)
    expect(message).toContain('sess_1')
    expect(isWorkspaceOccupied('上一轮仍执行中或状态不明，不能续发')).toBe(false)
  })
})
