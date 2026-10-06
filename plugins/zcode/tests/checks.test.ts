import { describe, expect, it } from 'vitest'
import { MAX_WAIT_SECONDS } from '../src/api.js'
import { requireAbsoluteWorkspace, requireExistingWorkspace, requireReplyTailChars, requireWaitSeconds } from '../src/checks.js'

describe('服务方法入口的取值校验', () => {
  it('workspace 要是绝对路径；要已存在的方法还查目录在不在', () => {
    expect(() => requireAbsoluteWorkspace('D:\\repo')).not.toThrow()
    expect(() => requireAbsoluteWorkspace('repo')).toThrow('绝对路径')
    expect(() => requireExistingWorkspace(process.cwd())).not.toThrow()
    expect(() => requireExistingWorkspace('repo')).toThrow('绝对路径')
    expect(() => requireExistingWorkspace('D:\\no-such-dir-gwb-zcode-test')).toThrow('不是已存在的目录')
  })

  it('waitSeconds 在 0 到上限之间', () => {
    expect(() => requireWaitSeconds(0)).not.toThrow()
    expect(() => requireWaitSeconds(MAX_WAIT_SECONDS)).not.toThrow()
    expect(() => requireWaitSeconds(MAX_WAIT_SECONDS + 1)).toThrow('waitSeconds')
    expect(() => requireWaitSeconds(-1)).toThrow('waitSeconds')
    expect(() => requireWaitSeconds(Number.NaN)).toThrow('waitSeconds')
  })

  it('replyTailChars 要是正整数', () => {
    expect(() => requireReplyTailChars(20000)).not.toThrow()
    expect(() => requireReplyTailChars(0)).toThrow('replyTailChars')
    expect(() => requireReplyTailChars(1.5)).toThrow('replyTailChars')
  })
})
