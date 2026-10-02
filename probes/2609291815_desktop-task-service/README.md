# 用代码驱动 ZCode 桌面端建任务、发指令

## 问什么

不用 computer-use 点界面，能不能用代码让 ZCode 桌面端新建一条会话、发指令、读回结果，并且这条会话出现在侧栏里。

## 怎么运行

```bash
node scripts/zcode-desktop.mjs create --workspace "D:\unitfolders\00000-console\console" --prompt "只回复：收到" --wait
```

要求 ZCode 桌面端开着、只有一个工作区窗口。`create` 新建会话并发指令，`send --task <id>` 续问，`read --task <id>` 读快照。
这份脚本是 2026-09-29 一个 Codex 会话写的，放在总控台仓的 `out/` 里（临时目录），原样复制过来；`scripts/` 下其余几个是它一步步试出这条路时用的片段：

- `zcode-probe.mjs`：连上 9229 调试端口，执行一段表达式
- `zcode-connect-expression.js`：在渲染进程里沿 React 树找到 `services.zcodeTaskService`
- `zcode-create-test.js`、`zcode-send-test.js`、`zcode-read-test.js`、`zcode-followup-test.js`：建任务、发指令、读快照、续问

`runs/01-codex-transcript.txt` 是那次 Codex 会话里用户与助手说的话，用 `node export-codex-session.mjs <rollout 文件>` 从
`~/.codex/sessions/2026/09/29/rollout-2026-09-29T17-37-30-01a0ec86-c344-7452-a7e4-e8c0c88404fb.jsonl` 导出（不含工具调用）。

## 结论

能。ZCode 主进程是 Electron 的 Node，`process._debugProcess(pid)` 能在不重启它的情况下打开 9229 调试端口；连上后用
`Runtime.evaluate` 取到 Electron 的 `BrowserWindow`，在工作区窗口里 `executeJavaScript`，沿 React 树找到客户端自己的
`zcodeTaskService`，调 `createTask`（要带 `v4Create: true`，旧的创建流程跟现在的发送协议对不上，报数据库关联错误）、
`sendPrompt`、`getTaskSnapshot`。建出的任务走客户端自己的流程，所以进侧栏。测试任务「ZCODE-SCRIPT-0929 代码入口验收指令」
建成、发出、读回、同一会话续问都成功。

同一次会话里先试了 CLI 无界面（能跑，但侧栏看不到，用户问「我在zcode的客户端没看见啊，你这是cli调用吗」），
又一度转去 computer-use，被用户否掉：「啥玩意啊？我要的是你这边调用个什么代码就可以驱动，不是computer use去操作啊」。

留下的问题：给 `createTask` 传 `mode: 'plan'`，快照里的模式仍是 `build`。

## 运行那次的环境

2026-09-29，Windows 11，ZCode 桌面端 3.14.4，CLI `zcode.cjs` 0.16.9，Node 24。本仓当时还不存在，没有被测对象的 commit。
