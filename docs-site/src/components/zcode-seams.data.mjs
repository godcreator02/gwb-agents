/**
 * 首页接缝图的数据：画面（zcode-seams.tsx）与机读文本（docfirst.config.mjs 的名册规则）读同一份。
 * 编号与首页正文「接缝逐条」的小节一一对应。
 */

export const modules = [
  { id: 'agent', title: '调用方', lines: ['别的插件：inject gwbZcode', 'agent：经 MCP 入口', 'run 调 zcode.* 命令'], x: 20, y: 20, w: 200, h: 92, color: '#ffd23f' },
  { id: 'plugin', title: 'gwb 插件 gwb-zcode', lines: ['服务 gwbZcode（本体）', 'open / create / send', 'status / archive', 'zcode.* 命令是薄封装'], x: 300, y: 20, w: 260, h: 124, color: '#7bdff2' },
  { id: 'skills', title: '说明书插件', lines: ['登记说明书 zcode'], x: 640, y: 20, w: 200, h: 72, color: '#e0e0e0' },
  { id: 'processes', title: 'Windows 进程表', lines: ['pwsh Get-CimInstance', '找主进程、核对启动参数'], x: 20, y: 214, w: 200, h: 86, color: '#f6f5ae' },
  { id: 'main', title: 'ZCode 主进程', lines: ['启动时带', '--remote-debugging-port=9339'], x: 630, y: 214, w: 220, h: 86, color: '#b2f7b1' },
  { id: 'window', title: 'ZCode 工作区窗口', lines: ['9339 端口上唯一的工作区页面', 'React 树里的 zcodeTaskService', '/ zcodeAgentService'], x: 300, y: 380, w: 260, h: 104, color: '#ff9bd2' },
  { id: 'session', title: 'ZCode 会话', lines: ['按完全访问（yolo）执行', '出现在侧栏里'], x: 640, y: 380, w: 200, h: 86, color: '#ffb385' },
  { id: 'waiter', title: '等待脚本', lines: ['dist/wait-round.js', 'Monitor 在后台运行', '经 gwb-mcp 客户端回调'], x: 20, y: 380, w: 200, h: 104, color: '#c3b1e1' },
]

/** 每条都是一次调用，没有读写磁盘的接缝 */
export const seams = [
  {
    n: 1,
    from: [220, 56],
    to: [300, 56],
    label: [258, 44],
    title: '调用方 → 插件',
    text: '别的插件 inject 服务 gwbZcode 调 open / create / send / status / archive；agent 经 MCP 入口 run 调同名的 zcode.* 命令，命令只查参数形状（认不出的键直接报错），再调同一个方法。相对路径、不存在的目录在方法里报错。派任务的两个方法发出即返回，status 最多等 240 秒，不碰 MCP 客户端 300 秒的上限。',
  },
  {
    n: 2,
    from: [320, 144],
    to: [180, 214],
    label: [238, 176],
    title: '插件 → 进程表',
    text: '用 pwsh 列出 ZCode.exe 进程，排除子进程（--type=、zcode.cjs、windows-helper），必须恰好剩一个主进程，否则报错。读它的 ZCode.exe 路径；命令行里没有 --remote-debugging-port=9339 就报错，写明怎么带着它重开。',
  },
  {
    n: 3,
    from: [430, 144],
    to: [430, 380],
    label: [450, 262],
    title: '插件 → 工作区窗口（远程调试端口）',
    text: '从 127.0.0.1:9339/json/list 找类型为 page、地址含 /out/renderer/index.html 的页面，必须恰好一个；经 WebSocket 发 Runtime.evaluate 直接在页面里执行，沿 React 树找到 zcodeTaskService 或 zcodeAgentService 并调它的方法，或读组件上的 activeWorkspacePath 得到窗口当前的工作区。同一 home 同时在跑的几次调用共用一个连接，最后一次结束只断开自己的连接；端口归 ZCode，插件不开也不关。',
  },
  {
    n: 4,
    from: [560, 423],
    to: [640, 423],
    label: [600, 411],
    title: '窗口 → 会话',
    text: 'createTask（v4Create）建会话；代理的 settings.mode.current 不是 yolo 就 setMode，是 yolo 才 sendPrompt，等这一轮的提问出现在快照里就交回；status 读 getTaskSnapshot，这一轮的回答都写完（有 durationMs）且状态结束才算做完；archive 调 archiveTask，用 listArchivedTasks 读回核对，还在跑的不归档。',
  },
  {
    n: 5,
    from: [560, 56],
    to: [640, 56],
    label: [600, 44],
    title: '插件 → 说明书插件',
    text: '局部注入 gwbSkills，登记包里的 skills/ 目录；没装说明书插件时服务与命令照常可用，只是 agent 读不到说明书。',
  },
  {
    n: 6,
    from: [560, 120],
    to: [690, 214],
    label: [628, 160],
    title: '插件 → 主进程（启动参数）',
    text: 'zcode.open 运行 ZCode.exe --open-workspace <目录>：ZCode 只允许一个实例，第二个实例把参数转给正在运行的主进程后退出，窗口切到那个工作区。之后经接缝 3 读回窗口当前的工作区核对。',
  },
  {
    n: 7,
    from: [220, 400],
    to: [350, 144],
    label: [296, 250],
    title: '等待脚本 → 插件（经 MCP 入口）',
    text: 'create / send 回执里的 waitCommand 运行本包的 dist/wait-round.js，参数是一段 base64url。Claude Code 的 Monitor 在后台运行它：脚本经本 home 的 gwb-mcp 命令行客户端循环调 zcode.status（每次等 120 秒），等的过程中不输出；这一轮结束打一行 ZCODE-ROUND-OVER，出错打一行 ZCODE-WAIT-FAILED，然后退出。',
  },
]

export function seamsAsText() {
  const moduleText = modules.map((m) => `${m.title}（${m.lines.join('，')}）`).join('；')
  const seamText = seams.map((s) => `${s.n} ${s.title}：${s.text}`).join(' ')
  return `[接缝图] 模块：${moduleText}。接缝：${seamText}`
}
