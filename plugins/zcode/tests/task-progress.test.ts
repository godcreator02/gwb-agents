import { describe, expect, it } from 'vitest'
import { type TaskSnapshot, assistantMessageIds, judgeRound, readSnapshot } from '../src/task-progress.js'

function snapshot(status: string, messages: TaskSnapshot['messages'], pendingPermissions: unknown[] = []): TaskSnapshot {
  return { meta: { title: '标题', status, mode: 'yolo' }, messages, fileChanges: [], runtime: { pendingPermissions } }
}

const firstRound = [
  { id: 'u1', role: 'user', content: '第一轮' },
  { id: 'a1', role: 'assistant', content: '第一轮的回答' },
]

describe('judgeRound', () => {
  it('刚发出时状态还是上一轮的 completed、没有新回答，不算结束', () => {
    const before = assistantMessageIds(snapshot('completed', firstRound))
    const justSent = snapshot('completed', [...firstRound, { id: 'u2', role: 'user', content: '第二轮' }])
    expect(judgeRound(justSent, 'sess_1', before).roundIsOver).toBe(false)
  })

  it('有了新回答且状态结束才算结束，只交回这一轮的回答', () => {
    const before = assistantMessageIds(snapshot('completed', firstRound))
    const messages = [...firstRound, { id: 'u2', role: 'user', content: '第二轮' }, { id: 'a2', role: 'assistant', content: '第二轮的回答' }]
    expect(judgeRound(snapshot('running', messages), 'sess_1', before).roundIsOver).toBe(false)
    const { roundIsOver, outcome } = judgeRound(snapshot('completed', messages), 'sess_1', before)
    expect(roundIsOver).toBe(true)
    expect(outcome).toMatchObject({ taskId: 'sess_1', status: 'completed', mode: 'yolo', replies: ['第二轮的回答'], timedOut: false })
  })

  it('失败没有回答也算结束；停在等人确认也交回', () => {
    expect(judgeRound(snapshot('failed', []), 'sess_1', new Set()).roundIsOver).toBe(true)
    expect(judgeRound(snapshot('running', [], [{ tool: 'Bash' }]), 'sess_1', new Set()).roundIsOver).toBe(true)
  })

  it('内容为空的回答（只有工具调用）不算回答', () => {
    const { outcome } = judgeRound(snapshot('running', [{ id: 'a1', role: 'assistant', content: '' }]), 'sess_1', new Set())
    expect(outcome.replies).toEqual([])
  })
})

describe('readSnapshot', () => {
  it('形状不对就报错', () => {
    expect(() => readSnapshot(null, 'sess_1')).toThrow('不是对象')
    expect(() => readSnapshot({ meta: { status: 'completed' }, messages: [] }, 'sess_1')).toThrow('缺 status 或 mode')
    expect(() => readSnapshot({ meta: { status: 'completed', mode: 'yolo' }, messages: {} }, 'sess_1')).toThrow('messages 不是数组')
  })
})
