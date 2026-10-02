import { describe, expect, it } from 'vitest'
import { type SnapshotMessage, type TaskSnapshot, judgeRound, messageIds, readAgentMode, readSnapshot } from '../src/task-progress.js'

function snapshot(status: string | undefined, messages: SnapshotMessage[], pendingPermissions: unknown[] = []): TaskSnapshot {
  return { meta: { title: '标题', status, mode: 'yolo' }, messages, fileChanges: [], runtime: { pendingPermissions } }
}

const firstRound: SnapshotMessage[] = [
  { id: 'u1', role: 'user', content: '第一轮' },
  { id: 'a1', role: 'assistant', content: '第一轮的回答', durationMs: 19627 },
]
const before = messageIds(snapshot('completed', firstRound))
const secondUser: SnapshotMessage = { id: 'u2', role: 'user', content: '第二轮' }

// 下面几个阶段照 2026-10-02 对一条会话每 250 毫秒读一次快照的实测顺序排
describe('judgeRound：一轮里快照的几个阶段', () => {
  it('刚发出：状态还是上一轮的 completed、没有新消息，不算结束', () => {
    expect(judgeRound(snapshot('completed', firstRound), 'sess_1', before).roundIsOver).toBe(false)
  })

  it('开始跑：running，出现这一轮的提问与空回答，不算结束', () => {
    const running = snapshot('running', [...firstRound, secondUser, { id: 'a2', role: 'assistant', content: '', durationMs: null }])
    expect(judgeRound(running, 'sess_1', before).roundIsOver).toBe(false)
  })

  it('状态先变 completed、回答还没写完（没有 durationMs），不算结束', () => {
    const lagging = snapshot('completed', [...firstRound, secondUser, { id: 'a2', role: 'assistant', content: '我先列一下', durationMs: null }])
    expect(judgeRound(lagging, 'sess_1', before).roundIsOver).toBe(false)
  })

  it('回答写完（有 durationMs）才算结束，只交回这一轮的回答', () => {
    const done = snapshot('completed', [...firstRound, secondUser, { id: 'a2', role: 'assistant', content: '一共 8 个', durationMs: 7446 }])
    const { roundIsOver, outcome } = judgeRound(done, 'sess_1', before)
    expect(roundIsOver).toBe(true)
    expect(outcome).toMatchObject({ taskId: 'sess_1', status: 'completed', mode: 'yolo', replies: ['一共 8 个'], timedOut: false })
  })
})

describe('judgeRound：失败与卡住', () => {
  it('上一轮失败留下的 failed 在这一轮开始前不算数', () => {
    expect(judgeRound(snapshot('failed', firstRound), 'sess_1', before).roundIsOver).toBe(false)
  })

  it('这一轮开始后失败，没有回答也算结束', () => {
    expect(judgeRound(snapshot('failed', [...firstRound, secondUser]), 'sess_1', before).roundIsOver).toBe(true)
  })

  it('停在等人确认就交回', () => {
    expect(judgeRound(snapshot('running', [...firstRound, secondUser], [{ tool: 'Bash' }]), 'sess_1', before).roundIsOver).toBe(true)
  })
})

describe('readAgentMode', () => {
  it('取 settings.mode.current，不取 session.mode', () => {
    expect(readAgentMode({ session: { mode: 'build' }, settings: { mode: { current: 'yolo' } } }, 'sess_1')).toBe('yolo')
    expect(() => readAgentMode({ session: { mode: 'build' } }, 'sess_1')).toThrow('settings.mode.current')
  })
})

describe('readSnapshot', () => {
  it('新建、还没发过指令的会话没有 status，照常读', () => {
    const fresh = readSnapshot({ meta: { title: 'New session', mode: 'build' }, messages: [], fileChanges: [] }, 'sess_1')
    expect(judgeRound(fresh, 'sess_1', new Set())).toMatchObject({ roundIsOver: false, outcome: { status: null } })
  })

  it('形状不对就报错', () => {
    expect(() => readSnapshot(null, 'sess_1')).toThrow('不是对象')
    expect(() => readSnapshot({ meta: { status: 'completed' }, messages: [] }, 'sess_1')).toThrow('缺 mode')
    expect(() => readSnapshot({ meta: { status: 1, mode: 'yolo' }, messages: [] }, 'sess_1')).toThrow('status 不是字符串')
    expect(() => readSnapshot({ meta: { status: 'completed', mode: 'yolo' }, messages: {} }, 'sess_1')).toThrow('messages 不是数组')
  })
})
