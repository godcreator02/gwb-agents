# zcode 能不能不经人手在侧栏开出新会话

## 问什么

除了人在 ZCode 桌面端点「新建任务」，还有哪些办法能开出一条会话、让它干活、并且出现在侧栏里。

## 怎么运行

```bash
node export-session.mjs sess_cf9bec1d-aefe-4207-a123-24e0a7330f92 > runs/01-session-transcript.txt
node export-automation.mjs automation-ae327cdd-82fe-4cda-8d15-6b51e1792827 > runs/02-automation-row.json
```

实验本身是 2026-09-12 在 ZCode 桌面端的一条会话里做的（工作区 `D:\unitfolders\26090520ntn\console`，那个单元后来撤掉了），
这里的两个脚本只读地从本机 ZCode 的库里导出当时的记录：`~/.zcode/cli/db/db.sqlite`（会话对话）与
`~/.zcode/v2/tasks-index.sqlite`（桌面端任务索引与自动化）。对话只导出文字与工具名，不导出工具参数——那次会话往
`~/.zcode/cli/config.json` 写过带 apiKey 的配置。库被清掉后脚本会报「没有这条会话」，`runs/` 里是 2026-10-02 导出的那份。

## 结论

五条路试下来，能开出会话的有三条：

| 路 | 结果 |
| --- | --- |
| CLI 无界面（`resources/glm/zcode.cjs --prompt`） | 能开会话、能 `--resume` 续问，但不进侧栏 |
| 定时自动化（ZCode 自己的 `CronCreate` 工具） | 到点由桌面端执行，进侧栏「定时任务」分组（`runs/02-automation-row.json` 里 `run_count` 1、`outcome` succeeded） |
| computer-use 点界面 | 点「新建任务」、键盘输入、回车，侧栏出现新会话 |
| `zcode://` 深链接 | 不行：路由只有 `oauth/callback`、`payment/callback`、`workspace/open` |
| 本地 HTTP 接口 | 不行：当时 ZCode 进程没有监听任何 TCP 端口 |

## 运行那次的环境

2026-09-12，Windows 11，ZCode 桌面端 3.11.2，CLI `zcode.cjs` 0.16.5。导出于 2026-10-02（ZCode CLI 0.16.9）。
本仓当时还不存在，没有被测对象的 commit。
