import { describe, expect, it } from 'vitest'
import { MAX_WAIT_SECONDS, parseArchiveArgs, parseCreateArgs, parseOpenArgs, parseSendArgs, parseStatusArgs } from '../src/args.js'

describe('parseOpenArgs', () => {
  it('只收 workspace，要绝对路径', () => {
    expect(parseOpenArgs({ workspace: 'D:\\repo' })).toEqual({ workspace: 'D:\\repo' })
    expect(() => parseOpenArgs({})).toThrow('缺 workspace')
    expect(() => parseOpenArgs({ workspace: 'repo' })).toThrow('要是绝对路径')
    expect(() => parseOpenArgs({ workspace: 'D:\\repo', prompt: 'x' })).toThrow('不认识参数 prompt')
  })
})

describe('parseCreateArgs', () => {
  it('只收 workspace 与 prompt', () => {
    expect(parseCreateArgs({ workspace: 'D:\\repo', prompt: '干活' })).toEqual({ workspace: 'D:\\repo', prompt: '干活' })
  })

  it('缺参数、相对路径、认不出的键都报错', () => {
    expect(() => parseCreateArgs(undefined)).toThrow('参数要是对象')
    expect(() => parseCreateArgs({ prompt: '干活' })).toThrow('缺 workspace')
    expect(() => parseCreateArgs({ workspace: 'repo', prompt: '干活' })).toThrow('要是绝对路径')
    expect(() => parseCreateArgs({ workspace: 'D:\\repo', prompt: '  ' })).toThrow('缺 prompt')
    expect(() => parseCreateArgs({ workspace: 'D:\\repo', prompt: '干活', mode: 'plan' })).toThrow('不认识参数 mode')
    expect(() => parseCreateArgs({ workspace: 'D:\\repo', prompt: '干活', timeoutSeconds: 60 })).toThrow('不认识参数 timeoutSeconds')
  })
})

describe('parseSendArgs', () => {
  it('要 task', () => {
    expect(parseSendArgs({ workspace: 'D:\\repo', task: 'sess_1', prompt: '接着干' })).toEqual({ workspace: 'D:\\repo', task: 'sess_1', prompt: '接着干' })
    expect(() => parseSendArgs({ workspace: 'D:\\repo', prompt: '接着干' })).toThrow('缺 task')
  })
})

describe('parseArchiveArgs', () => {
  it('只收 workspace 与 task', () => {
    expect(parseArchiveArgs({ workspace: 'D:\\repo', task: 'sess_1' })).toEqual({ workspace: 'D:\\repo', task: 'sess_1' })
    expect(() => parseArchiveArgs({ workspace: 'D:\\repo' })).toThrow('缺 task')
    expect(() => parseArchiveArgs({ workspace: 'D:\\repo', task: 'sess_1', prompt: 'x' })).toThrow('不认识参数 prompt')
  })
})

describe('parseStatusArgs', () => {
  it('waitSeconds 缺省 0，不超过上限', () => {
    expect(parseStatusArgs({ workspace: 'D:\\repo', task: 'sess_1' })).toEqual({ workspace: 'D:\\repo', task: 'sess_1', waitSeconds: 0, replyTailChars: null })
    expect(parseStatusArgs({ workspace: 'D:\\repo', task: 'sess_1', waitSeconds: MAX_WAIT_SECONDS }).waitSeconds).toBe(MAX_WAIT_SECONDS)
    expect(() => parseStatusArgs({ workspace: 'D:\\repo', task: 'sess_1', waitSeconds: MAX_WAIT_SECONDS + 1 })).toThrow('waitSeconds')
    expect(() => parseStatusArgs({ workspace: 'D:\\repo', task: 'sess_1', waitSeconds: -1 })).toThrow('waitSeconds')
    expect(() => parseStatusArgs({ workspace: 'D:\\repo', task: 'sess_1', waitSeconds: '60' })).toThrow('waitSeconds')
    expect(() => parseStatusArgs({ workspace: 'D:\\repo' })).toThrow('缺 task')
  })

  it('replyTailChars 缺省全部交回，给了要是正整数', () => {
    expect(parseStatusArgs({ workspace: 'D:\\repo', task: 'sess_1', replyTailChars: 20000 }).replyTailChars).toBe(20000)
    expect(() => parseStatusArgs({ workspace: 'D:\\repo', task: 'sess_1', replyTailChars: 0 })).toThrow('replyTailChars')
    expect(() => parseStatusArgs({ workspace: 'D:\\repo', task: 'sess_1', replyTailChars: 1.5 })).toThrow('replyTailChars')
    expect(() => parseStatusArgs({ workspace: 'D:\\repo', task: 'sess_1', replyTailChars: '20000' })).toThrow('replyTailChars')
  })
})
