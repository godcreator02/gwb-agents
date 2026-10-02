import fs from 'node:fs'
import type { GwbContext } from '@godcreator/gwb-kernel-desktop'
// 空的类型 import 只为让这几个包的 `declare module 'cordis'` 生效，ctx 上才有对应服务的类型
import type {} from '@godcreator/gwb-commands'
import type {} from '@godcreator/gwb-skills'
import { MAX_WAIT_SECONDS, parseCreateArgs, parseSendArgs, parseStatusArgs } from './args.js'
import { withDesktop } from './desktop.js'
import { createTask, readRound, sendRound } from './round.js'

export const name = 'gwb-zcode'

export const inject = ['gwbCommands']

const SENT_SHAPE =
  '发出后等这一轮在 ZCode 里开始了就交回（通常 2 秒左右），不等它做完：回 { taskId, title, status, mode, roundStarted }。' +
  '做完没有用 zcode.status 查；roundStarted 为 false 表示 30 秒内这一轮还没开始（多半排在还在跑的上一轮后面），这时 zcode.status 读到的仍是上一轮'

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
      description: '在 ZCode 桌面端的一个工作区里新建会话、以完全访问权限发出任务，发出即返回；会话出现在 ZCode 侧栏里',
      usage:
        '参数 { workspace: string, prompt: string }。workspace 是工作区目录的绝对路径（ZCode 在这个目录里干活）。' +
        '要求 ZCode 桌面端开着、只有一个工作区窗口。' +
        SENT_SHAPE +
        '；taskId 留着给 zcode.status 与 zcode.send',
      effect: 'external',
    },
    async (raw) => {
      const { workspace, prompt } = parseCreateArgs(raw)
      requireExistingDirectory('zcode.create', workspace)
      return withDesktop(warn, async (services) => {
        const taskId = await createTask(services, workspace)
        log.info(`在 ${workspace} 新建会话 ${taskId}`)
        return { ok: true, data: await sendRound(services, { workspace, taskId, prompt }) }
      })
    },
  )

  commands.register(
    {
      name: 'zcode.send',
      description: '在 ZCode 桌面端的一个已有会话里接着发指令（先切到完全访问），发出即返回',
      usage:
        '参数 { workspace: string, task: string, prompt: string }。task 是 zcode.create 回执里的 taskId，workspace 写建它时的那个目录。' +
        SENT_SHAPE,
      effect: 'external',
    },
    async (raw) => {
      const { workspace, task, prompt } = parseSendArgs(raw)
      requireExistingDirectory('zcode.send', workspace)
      return withDesktop(warn, async (services) => {
        log.info(`往会话 ${task} 发指令`)
        return { ok: true, data: await sendRound(services, { workspace, taskId: task, prompt }) }
      })
    },
  )

  commands.register(
    {
      name: 'zcode.status',
      description: '读 ZCode 一个会话最新一轮的进度与回答：做完没有、回答、是否停在等人确认',
      usage:
        `参数 { workspace: string, task: string, waitSeconds?: number }。waitSeconds 缺省 0 立即交回；给了就最多等这么久（不超过 ${MAX_WAIT_SECONDS}），做完就提前交回。` +
        '回 { taskId, title, status, mode, roundIsOver, replies, fileChanges, pendingPermissions }：roundIsOver 为 true 才是做完了；' +
        'replies 是这一轮的回答（按出现顺序，最后一条是收尾的话）；status 是 ZCode 的任务状态（completed / failed 等）；pendingPermissions 非空表示停在等人确认，去 ZCode 界面处理。' +
        '不改任何数据，但和另两条一样要临时打开 ZCode 主进程的调试端口',
      effect: 'write',
    },
    async (raw) => {
      const { workspace, task, waitSeconds } = parseStatusArgs(raw)
      requireExistingDirectory('zcode.status', workspace)
      return withDesktop(warn, async (services) => ({ ok: true, data: await readRound(services, { workspace, taskId: task, waitSeconds }) }))
    },
  )

  // 说明书在包根的 skills/，相对产物 dist/index.js 写作 '../skills/'；那个目录要在 package.json 的 files 里
  ctx.inject(['gwbSkills'], (scoped) => {
    scoped.effect(() => scoped.gwbSkills.register(new URL('../skills/', import.meta.url)))
  })

  log.info('已加载')
}
