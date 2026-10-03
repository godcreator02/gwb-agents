import { describe, expect, it } from 'vitest'
import { isSameWorkspace } from '../src/workspace.js'

describe('isSameWorkspace', () => {
  it('不分大小写、不管结尾分隔符', () => {
    expect(isSameWorkspace('D:\\repo\\collab', 'd:\\Repo\\collab\\')).toBe(true)
    expect(isSameWorkspace('D:\\repo\\collab', 'D:/repo/collab')).toBe(true)
  })

  it('不同目录不算同一个', () => {
    expect(isSameWorkspace('D:\\repo\\collab', 'D:\\repo')).toBe(false)
  })
})
