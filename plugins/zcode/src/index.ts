import { Service } from 'cordis'
import type { GwbContext } from '@godcreator/gwb-kernel-desktop'
// 空的类型 import 只为让这几个包的 `declare module 'cordis'` 生效，ctx 上才有对应服务的类型
import type {} from '@godcreator/gwb-commands'
import type {} from '@godcreator/gwb-skills'
import {
  type ArchivedTask,
  type GwbZcodeApi,
  type OpenedWorkspace,
  type SentRound,
  type ZcodeCreateInput,
  type ZcodeRoundStatus,
  type ZcodeSendInput,
  type ZcodeStatusInput,
  type ZcodeTaskInput,
  type ZcodeWorkspaceInput,
} from './api.js'
import { archiveTask } from './archive.js'
import { requireAbsoluteWorkspace, requireExistingWorkspace, requireReplyTailChars, requireWaitSeconds } from './checks.js'
import { registerZcodeCommands } from './commands.js'
import { withDesktop } from './desktop.js'
import { createTask, readRound, sendRound } from './round.js'
import { keepReplyTail } from './task-progress.js'
import { openWorkspace } from './workspace.js'

export * from './api.js'

const PLUGIN_NAME = 'gwb-zcode'

/** 服务 gwbZcode 的提供方；zcode.* 命令是它的薄封装（commands.ts） */
export default class GwbZcode extends Service implements GwbZcodeApi {
  static inject = ['gwbCommands']

  /** 方法里的 `this.ctx` 是调用方的；命令、说明书与日志登记在提供方自己的上下文上 */
  private readonly providerContext: GwbContext
  private readonly logInfo: (message: string) => void
  private readonly logWarn: (message: string) => void

  constructor(ctx: GwbContext) {
    super(ctx, 'gwbZcode')
    this.providerContext = ctx
    const logger = ctx.logger(PLUGIN_NAME)
    this.logInfo = (message: string): void => logger.info(message)
    this.logWarn = (message: string): void => logger.warn(message)
  }

  [Service.init](): void {
    registerZcodeCommands(this.providerContext, this)
    // 说明书在包根的 skills/，相对产物 dist/index.js 写作 '../skills/'；那个目录要在 package.json 的 files 里
    this.providerContext.inject(['gwbSkills'], (scoped) => {
      scoped.effect(() => scoped.gwbSkills.register(new URL('../skills/', import.meta.url)))
    })
    this.logInfo('已加载（服务 ctx.gwbZcode 与 zcode.* 命令）')
  }

  async open({ workspace }: ZcodeWorkspaceInput): Promise<OpenedWorkspace> {
    requireExistingWorkspace(workspace)
    const opened = await withDesktop(this.logWarn, (services) => openWorkspace(services, workspace))
    this.logInfo(opened.switched ? `窗口切到工作区 ${workspace}` : `窗口本来就在工作区 ${workspace}`)
    return opened
  }

  async create({ workspace, prompt }: ZcodeCreateInput): Promise<SentRound> {
    requireExistingWorkspace(workspace)
    return withDesktop(this.logWarn, async (services) => {
      const taskId = await createTask(services, workspace)
      this.logInfo(`在 ${workspace} 新建会话 ${taskId}`)
      return sendRound(services, { workspace, taskId, prompt })
    })
  }

  async send({ workspace, task, prompt, interrupt = false }: ZcodeSendInput): Promise<SentRound> {
    requireExistingWorkspace(workspace)
    return withDesktop(this.logWarn, async (services) => {
      this.logInfo(interrupt ? `打断会话 ${task} 当前这一轮、立即发指令` : `往会话 ${task} 发指令`)
      return sendRound(services, { workspace, taskId: task, prompt, interrupt })
    })
  }

  async status({ workspace, task, waitSeconds = 0, replyTailChars }: ZcodeStatusInput): Promise<ZcodeRoundStatus> {
    requireExistingWorkspace(workspace)
    requireWaitSeconds(waitSeconds)
    if (replyTailChars !== undefined) requireReplyTailChars(replyTailChars)
    const round = await withDesktop(this.logWarn, (services) => readRound(services, { workspace, taskId: task, waitSeconds }))
    const kept = replyTailChars === undefined ? { replies: round.replies, omittedReplyChars: 0 } : keepReplyTail(round.replies, replyTailChars)
    return { ...round, ...kept }
  }

  /** 不查目录在不在：归档不在目录里干活，目录删了的旧会话也要能收起来 */
  async archive({ workspace, task }: ZcodeTaskInput): Promise<ArchivedTask> {
    requireAbsoluteWorkspace(workspace)
    const archived = await withDesktop(this.logWarn, (services) => archiveTask(services, { workspace, taskId: task }))
    this.logInfo(`归档会话 ${task}`)
    return archived
  }
}

declare module 'cordis' {
  interface Context {
    gwbZcode: GwbZcodeApi
  }
}
