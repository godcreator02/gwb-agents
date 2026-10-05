import fs from 'node:fs'
import type { GwbContext } from '@godcreator/gwb-kernel-desktop'
// 空的类型 import 只为让这几个包的 `declare module 'cordis'` 生效，ctx 上才有对应服务的类型
import type {} from '@godcreator/gwb-commands'
import type {} from '@godcreator/gwb-skills'
import { archiveTask } from './archive.js'
import { MAX_WAIT_SECONDS, parseArchiveArgs, parseCreateArgs, parseOpenArgs, parseSendArgs, parseStatusArgs } from './args.js'
import { withDesktop } from './desktop.js'
import { createTask, readRound, sendRound } from './round.js'
import { keepReplyTail } from './task-progress.js'
import { openWorkspace } from './workspace.js'

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
      name: 'zcode.open',
      description: '把 ZCode 桌面端的窗口切到一个工作区（项目），侧栏随之显示这个工作区的会话',
      usage:
        '参数 { workspace: string }：工作区目录的绝对路径，要已存在。要求 ZCode 桌面端开着、只有一个工作区窗口。' +
        '窗口已经在这个工作区就不动；否则用 ZCode 自己的启动参数 --open-workspace 切过去，再读回窗口当前的工作区核对，10 秒内没切过去就报错。' +
        '回 { workspace, switched }：switched 为 false 表示本来就在这个工作区。' +
        'zcode.create 在哪个工作区建会话，侧栏就只在那个工作区下显示它，要让人看见就先 open 同一个目录',
      effect: 'write',
    },
    async (raw) => {
      const { workspace } = parseOpenArgs(raw)
      requireExistingDirectory('zcode.open', workspace)
      return withDesktop(warn, async (services) => {
        const opened = await openWorkspace(services, workspace)
        log.info(opened.switched ? `窗口切到工作区 ${workspace}` : `窗口本来就在工作区 ${workspace}`)
        return { ok: true, data: opened }
      })
    },
  )

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
        `参数 { workspace: string, task: string, waitSeconds?: number, replyTailChars?: number }。waitSeconds 缺省 0 立即交回；给了就最多等这么久（不超过 ${MAX_WAIT_SECONDS}），做完就提前交回。` +
        'replyTailChars（正整数）给了就只交回回答末尾这么多个字符，缺省全部交回：ZCode 会把这一轮的工具调用记录也写进回答，一条就可能有几万字，超过 MCP 单次返回的上限时带上它。' +
        '回 { taskId, title, status, mode, roundIsOver, replies, omittedReplyChars, fileChanges, pendingPermissions }：roundIsOver 为 true 才是做完了；' +
        'replies 是这一轮的回答（按出现顺序，最后一条是收尾的话）；omittedReplyChars 是按 replyTailChars 省掉的字符数，没省是 0；status 是 ZCode 的任务状态（completed / failed 等）；pendingPermissions 非空表示停在等人确认，去 ZCode 界面处理。' +
        '不改任何数据，但会按需打开 ZCode 主进程的本机调试端口；命令结束断开自己的连接，端口随 ZCode 退出关闭',
      effect: 'write',
    },
    async (raw) => {
      const { workspace, task, waitSeconds, replyTailChars } = parseStatusArgs(raw)
      requireExistingDirectory('zcode.status', workspace)
      return withDesktop(warn, async (services) => {
        const round = await readRound(services, { workspace, taskId: task, waitSeconds })
        const kept = replyTailChars === null ? { replies: round.replies, omittedReplyChars: 0 } : keepReplyTail(round.replies, replyTailChars)
        return { ok: true, data: { ...round, ...kept } }
      })
    },
  )

  commands.register(
    {
      name: 'zcode.archive',
      description: '归档 ZCode 的一个会话：从侧栏的会话列表里收起来，记录不删',
      usage:
        '参数 { workspace: string, task: string }：task 是会话 id，workspace 写建它时的那个目录（目录已经删了也行，它只是 ZCode 记会话用的键）。' +
        '还在跑（status 为 running）的会话直接报错，等这一轮做完再归档。' +
        '归档后读回 ZCode 的已归档列表核对，回 { taskId, title, archived: true }；已经归档过的再调一次照样成功',
      effect: 'write',
    },
    async (raw) => {
      // 不查目录在不在：归档不在目录里干活，目录删了的旧会话也要能收起来
      const { workspace, task } = parseArchiveArgs(raw)
      return withDesktop(warn, async (services) => {
        const archived = await archiveTask(services, { workspace, taskId: task })
        log.info(`归档会话 ${task}`)
        return { ok: true, data: archived }
      })
    },
  )

  // 说明书在包根的 skills/，相对产物 dist/index.js 写作 '../skills/'；那个目录要在 package.json 的 files 里
  ctx.inject(['gwbSkills'], (scoped) => {
    scoped.effect(() => scoped.gwbSkills.register(new URL('../skills/', import.meta.url)))
  })

  log.info('已加载')
}
