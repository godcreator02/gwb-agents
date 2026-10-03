/**
 * 首页接缝图的数据：画面（zcode-seams.tsx）与机读文本（docfirst.config.mjs 的名册规则）读同一份。
 * 编号与首页正文「接缝逐条」的小节一一对应。
 */

export const modules = [
  { id: 'agent', title: 'agent', lines: ['经 MCP 入口 run 调命令'], x: 20, y: 20, w: 200, h: 72, color: '#ffd23f' },
  { id: 'plugin', title: 'gwb 插件 gwb-zcode', lines: ['工作台主进程里', 'zcode.open / create / send', 'zcode.status / archive', '切工作区·发指令·读结果·归档'], x: 300, y: 20, w: 260, h: 124, color: '#7bdff2' },
  { id: 'skills', title: '说明书插件', lines: ['登记说明书 zcode'], x: 640, y: 20, w: 200, h: 72, color: '#e0e0e0' },
  { id: 'processes', title: 'Windows 进程表', lines: ['pwsh Get-CimInstance', '找唯一的 ZCode 主进程'], x: 20, y: 214, w: 200, h: 86, color: '#f6f5ae' },
  { id: 'main', title: 'ZCode 主进程', lines: ['Electron 的 Node', '调试端口 127.0.0.1:9229'], x: 300, y: 214, w: 260, h: 86, color: '#b2f7b1' },
  { id: 'window', title: 'ZCode 工作区窗口', lines: ['渲染进程，React 树里的', 'zcodeTaskService / zcodeAgentService'], x: 300, y: 380, w: 260, h: 86, color: '#ff9bd2' },
  { id: 'session', title: 'ZCode 会话', lines: ['按完全访问（yolo）执行', '出现在侧栏里'], x: 640, y: 380, w: 200, h: 86, color: '#ffb385' },
]

/** 每条都是一次调用，没有读写磁盘的接缝 */
export const seams = [
  {
    n: 1,
    from: [220, 56],
    to: [300, 56],
    label: [258, 44],
    title: 'agent → 插件',
    text: 'agent 经 MCP 入口 run 调 zcode.open / create / send / status / archive；认不出的参数、相对路径、不存在的目录直接报错。派任务的两条发出即返回，status 最多等 240 秒，不碰 MCP 客户端 300 秒的上限。',
  },
  {
    n: 2,
    from: [320, 144],
    to: [180, 214],
    label: [238, 176],
    title: '插件 → 进程表',
    text: '用 pwsh 列出 ZCode.exe 进程，排除子进程（--type=、zcode.cjs、windows-helper），必须恰好剩一个主进程，否则报错。',
  },
  {
    n: 3,
    from: [410, 144],
    to: [410, 214],
    label: [390, 180],
    title: '插件 → 主进程（调试端口）',
    text: '端口没开就 process._debugProcess(pid) 打开它，经 WebSocket 发 Runtime.evaluate；核对端口属于这个 pid。几条命令共用一个连接，最后一条结束才关端口。',
  },
  {
    n: 4,
    from: [430, 300],
    to: [430, 380],
    label: [450, 340],
    title: '主进程 → 工作区窗口',
    text: '在主进程里取 Electron 的 BrowserWindow，必须恰好一个工作区窗口；在它里面 executeJavaScript，沿 React 树找到 zcodeTaskService 或 zcodeAgentService 并调它的方法，或读组件上的 activeWorkspacePath 得到窗口当前的工作区。',
  },
  {
    n: 5,
    from: [560, 423],
    to: [640, 423],
    label: [600, 411],
    title: '窗口 → 会话',
    text: 'createTask（v4Create）建会话；代理的 settings.mode.current 不是 yolo 就 setMode，是 yolo 才 sendPrompt，等这一轮的提问出现在快照里就交回；status 读 getTaskSnapshot，这一轮的回答都写完（有 durationMs）且状态结束才算做完；archive 调 archiveTask，用 listArchivedTasks 读回核对，还在跑的不归档。',
  },
  {
    n: 6,
    from: [560, 56],
    to: [640, 56],
    label: [600, 44],
    title: '插件 → 说明书插件',
    text: '局部注入 gwbSkills，登记包里的 skills/ 目录；没装说明书插件时命令照常可用，只是 agent 读不到说明书。',
  },
  {
    n: 7,
    from: [520, 144],
    to: [520, 214],
    label: [540, 180],
    title: '插件 → 主进程（启动参数）',
    text: 'zcode.open 运行 ZCode.exe --open-workspace <目录>：ZCode 只允许一个实例，第二个实例把参数转给正在运行的主进程后退出，窗口切到那个工作区。之后经接缝 3、4 读回窗口当前的工作区核对。',
  },
]

export function seamsAsText() {
  const moduleText = modules.map((m) => `${m.title}（${m.lines.join('，')}）`).join('；')
  const seamText = seams.map((s) => `${s.n} ${s.title}：${s.text}`).join(' ')
  return `[接缝图] 模块：${moduleText}。接缝：${seamText}`
}
