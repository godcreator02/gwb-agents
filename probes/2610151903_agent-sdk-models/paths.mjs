import { join } from 'node:path'
import { tmpdir } from 'node:os'

// agent 的工作目录放在系统临时目录：放在任何 git 仓里时，agent 跑的 git 命令会作用到那个仓（这里是 gwb-agents）
export const workRoot = join(tmpdir(), 'sdk-lab-work')
