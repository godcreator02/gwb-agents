import type { GwbContext } from '@godcreator/gwb-kernel-desktop'
import { parseArchiveArgs, parseCreateArgs, parseOpenArgs, parseSendArgs, parseStatusArgs } from './args.js'
import { MAX_WAIT_SECONDS, type GwbZcodeApi } from './api.js'

/** zcode.* 命令是服务 gwbZcode 的薄封装，给经 MCP 来的 agent 用：只查参数形状，然后调同名服务方法 */

const SENT_SHAPE =
  '发出后等这一轮在 ZCode 里开始了就交回（通常 2 秒左右），不等它做完：回 { taskId, title, status, mode, roundStarted, waitCommand }。' +
  'roundStarted 为 false 表示 30 秒内这一轮还没开始（多半排在同一会话还在跑的上一轮后面），这时 zcode.status 读到的仍是上一轮。' +
  'waitCommand 是一条命令行：在 Claude Code 里原样交给 Monitor 工具在后台等，这一轮结束时打一行 ZCODE-ROUND-OVER {taskId,status,mode,pendingPermissions,lastReplyTail} 后退出，' +
  '出错打一行 ZCODE-WAIT-FAILED <原因>；Monitor 到时限前没等到就用同一条命令再开一次。收到结束那一行后用 zcode.status 读完整回答。没有 Monitor 的客户端用 zcode.status 轮询'

export function registerZcodeCommands(ctx: GwbContext, zcode: GwbZcodeApi): void {
  const commands = ctx.gwbCommands
  if (commands === undefined) throw new Error('ctx.gwbCommands 不在：inject 里写了它，cordis 本不该调用到这里')

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
    async (raw) => ({ ok: true, data: await zcode.open(parseOpenArgs(raw)) }),
  )

  commands.register(
    {
      name: 'zcode.create',
      description: '在 ZCode 桌面端的一个工作区里新建会话、以完全访问权限发出任务，发出即返回；会话出现在 ZCode 侧栏里',
      usage:
        '参数 { workspace: string, prompt: string }。workspace 是工作区目录的绝对路径。要求 ZCode 桌面端开着、只有一个工作区窗口。' +
        '同一个工作区可以同时开几条会话，会不会改到同一个文件由派任务的一方安排。' +
        SENT_SHAPE +
        '；taskId 留着给 zcode.status 与 zcode.send',
      effect: 'external',
    },
    async (raw) => ({ ok: true, data: await zcode.create(parseCreateArgs(raw)) }),
  )

  commands.register(
    {
      name: 'zcode.send',
      description: '在 ZCode 桌面端的一个已有会话里接着发指令（先切到完全访问），发出即返回',
      usage:
        '参数 { workspace: string, task: string, prompt: string, interrupt?: boolean }。task 是 zcode.create 回执里的 taskId，workspace 写建它时的那个目录。' +
        '会话还在跑时，不给 interrupt 新指令排在这一轮后面，等这一轮做完才读到；interrupt 为 true 就不排队：当场取消正在跑的命令或工具调用（子进程被结束），用这条指令开新的一轮，前面的上下文还在，' +
        '同界面上排队消息的「立即」。中途纠正派出去的任务用它；正在跑数据迁移、写盘这类中途打断会留下半截结果的命令时别用。ZCode 没按立即发出（比如排进了队列）就报错并写明实际怎么投递的。' +
        SENT_SHAPE,
      effect: 'external',
    },
    async (raw) => ({ ok: true, data: await zcode.send(parseSendArgs(raw)) }),
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
        '不改任何数据，只经 ZCode 已开着的远程调试端口读快照',
      effect: 'read',
    },
    async (raw) => ({ ok: true, data: await zcode.status(parseStatusArgs(raw)) }),
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
    async (raw) => ({ ok: true, data: await zcode.archive(parseArchiveArgs(raw)) }),
  )
}
