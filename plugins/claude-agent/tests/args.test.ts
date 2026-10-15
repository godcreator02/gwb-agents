import { describe, expect, it } from 'vitest'
import { parseCreateArgs, parseSendArgs, parseSetupStatusArgs, parseStatusArgs } from '../src/args.js'

describe('命令参数的形状', () => {
  it('收下认识的键，可选项不给就不出现', () => {
    expect(parseCreateArgs({ workspace: 'D:/w', prompt: 'p' })).toEqual({ workspace: 'D:/w', prompt: 'p' })
    expect(parseCreateArgs({ workspace: 'D:/w', prompt: 'p', model: 'deepseek' })).toEqual({ workspace: 'D:/w', prompt: 'p', model: 'deepseek' })
    expect(parseSendArgs({ workspace: 'D:/w', sessionId: 's', prompt: 'p', interrupt: true })).toMatchObject({ interrupt: true })
    expect(parseStatusArgs({ workspace: 'D:/w', sessionId: 's' })).toEqual({ workspace: 'D:/w', sessionId: 's' })
    expect(() => parseSetupStatusArgs(undefined)).not.toThrow()
  })

  it('认不出的键、类型不对直接报错', () => {
    expect(() => parseCreateArgs({ workspace: 'D:/w', prompt: 'p', agent: 'x' })).toThrow('不认识参数 agent')
    expect(() => parseCreateArgs({ workspace: 'D:/w', prompt: 'p', model: 1 })).toThrow('model 要是字符串')
    expect(() => parseSendArgs({ workspace: 'D:/w', sessionId: 's', prompt: 'p', interrupt: 'yes' })).toThrow('true 或 false')
    expect(() => parseStatusArgs({ workspace: 'D:/w' })).toThrow('缺 sessionId')
    expect(() => parseSetupStatusArgs({ verbose: true })).toThrow('不认识参数 verbose')
  })
})
