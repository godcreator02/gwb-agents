import { join } from 'node:path'

// agent 的工作目录放在仓外的单元根下：放在仓里时，agent 跑的 git 命令会作用到 sdk-lab 仓本身
export const workRoot = join(import.meta.dirname, '..', 'work')
