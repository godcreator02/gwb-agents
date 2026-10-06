import { describe, expect, it } from 'vitest'
import { WorkspaceOccupancy } from '../src/occupancy.js'

const ws = 'D:\\proj\\repo'

describe('WorkspaceOccupancy', () => {
  it('同一会话续轮放行；别的会话来占时抛占用错误，信息里带占用中的 taskId', () => {
    const table = new WorkspaceOccupancy()
    table.claim(ws, 'sess_a')
    expect(() => table.claim(ws, 'sess_a')).not.toThrow()
    expect(() => table.claim(ws, 'sess_b')).toThrow('workspace 已被会话 sess_a 占用')
  })
  it('路径大小写与斜杠归一后是同一个工作区', () => {
    const table = new WorkspaceOccupancy()
    table.claim('d:/PROJ/Repo', 'sess_a')
    expect(() => table.claim('D:\\proj\\repo\\', 'sess_b')).toThrow('sess_a')
  })
  it('release 只放开自己占的那一条，别人占着的、没人占的都照常返回', () => {
    const table = new WorkspaceOccupancy()
    table.claim(ws, 'sess_a')
    table.release(ws, 'sess_b')
    expect(() => table.claim(ws, 'sess_c')).toThrow('sess_a')
    table.release(ws, 'sess_a')
    expect(() => table.claim(ws, 'sess_c')).not.toThrow()
  })
})
