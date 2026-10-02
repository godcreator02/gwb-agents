# 插件装进隔离 home 后出的两个问题：切完全访问读不回、一轮还没做完就交回

## 问什么

插件第一版在隔离 home 里调 `zcode.create` / `zcode.send`，切完全访问后读回的模式是 `build`、指令不发；放过这一步后，回执里只有回答的开头一句。
这两件事的原因是什么、什么信号才可靠。

## 怎么运行

```bash
node turn-progress.mjs <sessionId> "D:\unitfolders\00000-console\console"
```

每个脚本第一行写了做什么与用法；都要开着 ZCode 桌面端，经调试端口 9229 调客户端的服务。**这几个脚本中途报错时不关端口**（插件里的版本会关），
跑完用 `Get-NetTCPConnection -LocalPort 9229` 看一眼，开着就照插件 `src/desktop.ts` 关端口那一句关掉。各份 `runs/` 对应：

- `01-plugin-first-failures.txt`：插件第一版的报错原文，与 `snapshot-meta.mjs` 读到的新会话 meta
- `02-set-mode-timeline.txt`：`set-mode-timeline.mjs` 与 `create-with-mode.mjs` 的输出
- `03-agent-log-mode.txt`：从 `~/.zcode/cli/log/zcode-2026-10-02.jsonl` 抽出两条会话与模式有关的事件（抽取脚本见下）
- `04-agent-vs-meta-mode.txt`：`agent-mode.mjs` 的输出
- `05-toggle-mode.txt`：`toggle-mode.mjs` 的输出
- `06-turn-progress.txt`：`turn-progress.mjs` 的输出
- `07-plugin-acceptance.txt`：改完以后插件在隔离 home 里的验收

`03` 的抽取：在 node 里逐行读那份 jsonl，挑出含会话 id、事件是 `zcode_protocol.session_create.started`、
`bootstrap.app.startup.runtime_config.completed`、`session.mode.updated` 的行，打印 `mode`、`previousMode`、`persistence`。

## 结论

**任务的 `meta.mode` 不一定是代理实际用的模式。** 新会话的代理进程按「这个工作区上次用的模式」启动（`03`：17:35 那条启动时是 `build`、
`setMode` 后记了一条 `session.mode.updated` build→yolo；17:56 那条启动时已经是 `yolo`，没有这条事件），而任务的 `meta.mode` 只在代理的模式真的变了时才更新，
所以继承到 `yolo` 的新会话 `meta.mode` 一直是 `build`，`setMode('yolo')` 也改不动它（`02`，读了 16 秒）。代理实际用的模式在
`zcodeAgentService.readSession` 的 `settings.mode.current`（`04`），`session.mode` 与 `meta.mode` 一样是旧值；会话不在活动时 `readSession` 报
`Session is not active`，先读一次任务快照会让 ZCode 恢复它。先切 `build` 再切 `yolo` 两处都会变成 `yolo`（`05`）。`createTask` 带 `mode` 不起作用（`02`）。

**一轮做完要看回答写完没有，不能只看 status。** 一轮里助手的回答按同一个消息 id 越写越长；`06` 里发出后 1.3 秒状态还是上一轮的 `completed`、没有新消息，
2 秒变 `running` 并出现这一轮的提问与空回答，9.3 秒状态已经是 `completed` 而回答还是空的，10.2 秒回答才写进来、同时有了 `durationMs`。
插件第一版按「状态结束 + 有新回答」判断，在回答只写了开头一句时就交回了。改成：出现了发出前没有的消息、状态是结束类的、这一轮的助手消息都有 `durationMs`。

另外，新建还没发过指令的会话，快照 `meta` 里没有 `status` 字段（`01`）。

## 运行那次的环境

2026-10-02 17:54–18:11，Windows 11，ZCode 桌面端 3.14.4（安装包 `resources/glm/zcode.cjs` 0.16.9，主进程从 17:08 起没重启过），Node 24.14.1。
被测插件是本仓 `plugins/zcode` 第一个提交之后的工作区版本，隔离 home `zcode-2610021753`。
