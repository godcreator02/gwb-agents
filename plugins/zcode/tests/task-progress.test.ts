import { describe, expect, it } from 'vitest'
import { type SnapshotMessage, type TaskSnapshot, messageIds, readAgentMode, readLatestRound, readSnapshot, roundHasStarted } from '../src/task-progress.js'

function snapshot(status: string | undefined, messages: SnapshotMessage[], pendingPermissions: unknown[] = []): TaskSnapshot {
  return { meta: { title: '标题', status, mode: 'yolo' }, messages, fileChanges: [], runtime: { pendingPermissions } }
}

const firstRound: SnapshotMessage[] = [
  { id: 'u1', role: 'user', content: '第一轮' },
  { id: 'a1', role: 'assistant', content: '第一轮的回答', durationMs: 19627 },
]
const secondUser: SnapshotMessage = { id: 'u2', role: 'user', content: '第二轮' }

// 下面几个阶段照 2026-10-02 对一条会话每 250 毫秒读一次快照的实测顺序排
describe('roundHasStarted：发出后这一轮的提问出现了没有', () => {
  it('刚发出：状态还是上一轮的 completed、没有新消息，没开始', () => {
    expect(roundHasStarted(snapshot('completed', firstRound), messageIds(snapshot('completed', firstRound)))).toBe(false)
  })

  it('这一轮的提问出现了，开始了', () => {
    expect(roundHasStarted(snapshot('running', [...firstRound, secondUser]), messageIds(snapshot('completed', firstRound)))).toBe(true)
  })
})

describe('readLatestRound：一轮里快照的几个阶段', () => {
  it('开始跑：running，出现这一轮的提问与空回答，没做完', () => {
    const running = snapshot('running', [...firstRound, secondUser, { id: 'a2', role: 'assistant', content: '', durationMs: null }])
    expect(readLatestRound(running, 'sess_1')).toMatchObject({ roundIsOver: false, replies: [] })
  })

  it('状态先变 completed、回答还没写完（没有 durationMs），没做完', () => {
    const lagging = snapshot('completed', [...firstRound, secondUser, { id: 'a2', role: 'assistant', content: '我先列一下', durationMs: null }])
    expect(readLatestRound(lagging, 'sess_1').roundIsOver).toBe(false)
  })

  it('回答写完（有 durationMs）才算做完，只交回最后一条提问之后的回答', () => {
    const done = snapshot('completed', [...firstRound, secondUser, { id: 'a2', role: 'assistant', content: '一共 8 个', durationMs: 7446 }])
    expect(readLatestRound(done, 'sess_1')).toMatchObject({ taskId: 'sess_1', status: 'completed', roundIsOver: true, replies: ['一共 8 个'] })
  })
})

describe('readLatestRound：失败、卡住、没发过指令', () => {
  it('失败没有回答也算这一轮停下了', () => {
    expect(readLatestRound(snapshot('failed', [...firstRound, secondUser]), 'sess_1').roundIsOver).toBe(true)
  })

  it('停在等人确认就算停下了', () => {
    expect(readLatestRound(snapshot('running', [...firstRound, secondUser], [{ tool: 'Bash' }]), 'sess_1').roundIsOver).toBe(true)
  })

  it('还没发过指令的会话：没有轮，也没做完', () => {
    expect(readLatestRound(snapshot(undefined, []), 'sess_1')).toMatchObject({ status: null, roundIsOver: false, replies: [] })
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
    expect(readSnapshot({ meta: { title: 'New session', mode: 'build' }, messages: [], fileChanges: [] }, 'sess_1').meta.status).toBeUndefined()
  })

  it('形状不对就报错', () => {
    expect(() => readSnapshot(null, 'sess_1')).toThrow('不是对象')
    expect(() => readSnapshot({ meta: { status: 'completed' }, messages: [] }, 'sess_1')).toThrow('缺 mode')
    expect(() => readSnapshot({ meta: { status: 1, mode: 'yolo' }, messages: [] }, 'sess_1')).toThrow('status 不是字符串')
    expect(() => readSnapshot({ meta: { status: 'completed', mode: 'yolo' }, messages: {} }, 'sess_1')).toThrow('messages 不是数组')
  })
})
