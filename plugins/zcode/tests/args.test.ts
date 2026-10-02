import { describe, expect, it } from 'vitest'
import { DEFAULT_TIMEOUT_SECONDS, parseCreateArgs, parseSendArgs } from '../src/args.js'

describe('parseCreateArgs', () => {
  it('timeoutSeconds 缺省 1800', () => {
    expect(parseCreateArgs({ workspace: 'D:\\repo', prompt: '干活' })).toEqual({
      workspace: 'D:\\repo',
      prompt: '干活',
      timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    })
  })

  it('缺参数、相对路径、认不出的键、超时不是正数都报错', () => {
    expect(() => parseCreateArgs(undefined)).toThrow('参数要是对象')
    expect(() => parseCreateArgs({ prompt: '干活' })).toThrow('缺 workspace')
    expect(() => parseCreateArgs({ workspace: 'repo', prompt: '干活' })).toThrow('要是绝对路径')
    expect(() => parseCreateArgs({ workspace: 'D:\\repo', prompt: '  ' })).toThrow('缺 prompt')
    expect(() => parseCreateArgs({ workspace: 'D:\\repo', prompt: '干活', mode: 'plan' })).toThrow('不认识参数 mode')
    expect(() => parseCreateArgs({ workspace: 'D:\\repo', prompt: '干活', timeoutSeconds: 0 })).toThrow('要是正数')
    expect(() => parseCreateArgs({ workspace: 'D:\\repo', prompt: '干活', timeoutSeconds: '60' })).toThrow('要是正数')
  })
})

describe('parseSendArgs', () => {
  it('要 task', () => {
    expect(parseSendArgs({ workspace: 'D:\\repo', task: 'sess_1', prompt: '接着干', timeoutSeconds: 60 })).toEqual({
      workspace: 'D:\\repo',
      task: 'sess_1',
      prompt: '接着干',
      timeoutSeconds: 60,
    })
    expect(() => parseSendArgs({ workspace: 'D:\\repo', prompt: '接着干' })).toThrow('缺 task')
  })
})
