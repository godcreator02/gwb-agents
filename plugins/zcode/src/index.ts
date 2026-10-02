import fs from 'node:fs'
import type { GwbContext } from '@godcreator/gwb-kernel-desktop'
// 空的类型 import 只为让这几个包的 `declare module 'cordis'` 生效，ctx 上才有对应服务的类型
import type {} from '@godcreator/gwb-commands'
import type {} from '@godcreator/gwb-skills'
import { parseCreateArgs, parseSendArgs } from './args.js'
import { withDesktop } from './desktop.js'
import { createTask, sendRoundAndWait } from './round.js'

export const name = 'gwb-zcode'

export const inject = ['gwbCommands']

const RESULT_SHAPE =
  '回 { taskId, title, status, mode, replies, fileChanges, pendingPermissions, timedOut }：replies 是这一轮新出现的回答（按出现顺序，最后一条是收尾的话）；' +
  'status 是 ZCode 的任务状态（completed / failed 等）；timedOut 为 true 时 ZCode 还在做，任务没有取消，等一会儿用 zcode.send 问进度；' +
  'pendingPermissions 非空表示停在等人确认，去 ZCode 界面处理'

function requireExistingDirectory(commandName: string, workspace: string): void {
  if (!fs.statSync(workspace, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`${commandName} 的 workspace 不是已存在的目录：${workspace}`)
}

export function apply(ctx: GwbContext): void {
  const log = ctx.logger(name)
  const commands = ctx.gwbCommands
  if (commands === undefined) throw new Error('ctx.gwbCommands 不在：inject 里写了它，cordis 本不该调用 apply')
  const warn = (message: string): void => log.warn(message)

  commands.register(
    {
      name: 'zcode.create',
      description: '在 ZCode 桌面端的一个工作区里新建会话、以完全访问权限发出任务，等它做完交回回答；会话出现在 ZCode 侧栏里',
      usage:
        '参数 { workspace: string, prompt: string, timeoutSeconds?: number }。workspace 是工作区目录的绝对路径（ZCode 在这个目录里干活）；' +
        'timeoutSeconds 缺省 1800，到点先交回、任务不取消。要求 ZCode 桌面端开着、只有一个工作区窗口。' +
        RESULT_SHAPE +
        '；taskId 留着给 zcode.send 续上',
      effect: 'external',
    },
    async (raw) => {
      const { workspace, prompt, timeoutSeconds } = parseCreateArgs(raw)
      requireExistingDirectory('zcode.create', workspace)
      return withDesktop(warn, async (taskService) => {
        const taskId = await createTask(taskService, workspace)
        log.info(`在 ${workspace} 新建会话 ${taskId}`)
        return { ok: true, data: await sendRoundAndWait(taskService, { workspace, taskId, prompt, timeoutSeconds }) }
      })
    },
  )

  commands.register(
    {
      name: 'zcode.send',
      description: '在 ZCode 桌面端的一个已有会话里接着发指令（先切到完全访问），等它做完交回回答',
      usage:
        '参数 { workspace: string, task: string, prompt: string, timeoutSeconds?: number }。task 是 zcode.create 回执里的 taskId，' +
        'workspace 写建它时的那个目录；其余同 zcode.create。' +
        RESULT_SHAPE,
      effect: 'external',
    },
    async (raw) => {
      const { workspace, task, prompt, timeoutSeconds } = parseSendArgs(raw)
      requireExistingDirectory('zcode.send', workspace)
      return withDesktop(warn, async (taskService) => {
        log.info(`往会话 ${task} 发指令`)
        return { ok: true, data: await sendRoundAndWait(taskService, { workspace, taskId: task, prompt, timeoutSeconds }) }
      })
    },
  )

  // 说明书在包根的 skills/，相对产物 dist/index.js 写作 '../skills/'；那个目录要在 package.json 的 files 里
  ctx.inject(['gwbSkills'], (scoped) => {
    scoped.effect(() => scoped.gwbSkills.register(new URL('../skills/', import.meta.url)))
  })

  log.info('已加载')
}
