import { describe, expect, it } from 'vitest'
import { parseArchiveArgs, parseCreateArgs, parseOpenArgs, parseSendArgs, parseStatusArgs } from '../src/args.js'

describe('parseOpenArgs', () => {
  it('只收 workspace', () => {
    expect(parseOpenArgs({ workspace: 'D:\\repo' })).toEqual({ workspace: 'D:\\repo' })
    expect(() => parseOpenArgs({})).toThrow('缺 workspace')
    expect(() => parseOpenArgs({ workspace: 'D:\\repo', prompt: 'x' })).toThrow('不认识参数 prompt')
  })
})

describe('parseCreateArgs', () => {
  it('只收 workspace 与 prompt', () => {
    expect(parseCreateArgs({ workspace: 'D:\\repo', prompt: '干活' })).toEqual({ workspace: 'D:\\repo', prompt: '干活' })
  })

  it('缺参数、认不出的键都报错', () => {
    expect(() => parseCreateArgs(undefined)).toThrow('参数要是对象')
    expect(() => parseCreateArgs({ prompt: '干活' })).toThrow('缺 workspace')
    expect(() => parseCreateArgs({ workspace: 'D:\\repo', prompt: '  ' })).toThrow('缺 prompt')
    expect(() => parseCreateArgs({ workspace: 'D:\\repo', prompt: '干活', mode: 'plan' })).toThrow('不认识参数 mode')
    expect(() => parseCreateArgs({ workspace: 'D:\\repo', prompt: '干活', report: {} })).toThrow('不认识参数 report')
  })
})

describe('parseSendArgs', () => {
  it('要 task', () => {
    expect(parseSendArgs({ workspace: 'D:\\repo', task: 'sess_1', prompt: '接着干' })).toEqual({ workspace: 'D:\\repo', task: 'sess_1', prompt: '接着干' })
    expect(() => parseSendArgs({ workspace: 'D:\\repo', prompt: '接着干' })).toThrow('缺 task')
  })

  it('interrupt 不给就不带，给了要是布尔', () => {
    expect(parseSendArgs({ workspace: 'D:\\repo', task: 'sess_1', prompt: '停下改做这个', interrupt: true })).toEqual({ workspace: 'D:\\repo', task: 'sess_1', prompt: '停下改做这个', interrupt: true })
    expect(() => parseSendArgs({ workspace: 'D:\\repo', task: 'sess_1', prompt: '停下', interrupt: 'yes' })).toThrow('interrupt 要是 true 或 false')
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
  it('waitSeconds 与 replyTailChars 不给就不带，给了要是数', () => {
    expect(parseStatusArgs({ workspace: 'D:\\repo', task: 'sess_1' })).toEqual({ workspace: 'D:\\repo', task: 'sess_1' })
    expect(parseStatusArgs({ workspace: 'D:\\repo', task: 'sess_1', waitSeconds: 60, replyTailChars: 600 })).toEqual({ workspace: 'D:\\repo', task: 'sess_1', waitSeconds: 60, replyTailChars: 600 })
    expect(() => parseStatusArgs({ workspace: 'D:\\repo', task: 'sess_1', waitSeconds: '60' })).toThrow('waitSeconds')
    expect(() => parseStatusArgs({ workspace: 'D:\\repo', task: 'sess_1', replyTailChars: '20000' })).toThrow('replyTailChars')
    expect(() => parseStatusArgs({ workspace: 'D:\\repo' })).toThrow('缺 task')
  })
})
