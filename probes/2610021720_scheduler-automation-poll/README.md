# ZCode 有没有官方的外部派任务入口：调度进程与自动化表

## 问什么

用户问「你想想有没有更好的办法，codex未必是最佳方案」之后，查 ZCode 桌面端自己的代码：有没有不经调试端口、能从外部派任务
并让任务进侧栏的入口。

## 怎么运行

```bash
node asar.mjs grep 'SELECT \* FROM automations' '^out/scheduler/index.js' 500
```

`asar.mjs` 直接读 ZCode 安装包 `resources/app.asar` 的文件表，在里面的 js 里按正则搜，打印命中前后的字符；`cli-grep.mjs` 对安装包自带的 CLI
`resources/glm/zcode.cjs` 做同样的事。`runs/` 下五份是各条命令的输出，命令写在下面结论里对应的位置。代码是压缩过的，变量名每个版本都会变，
换了版本要按字符串常量重新搜。

## 结论

ZCode 没有给外部用的建任务入口；唯一不经界面、由 ZCode 自己执行的是定时自动化，但用户不要这条路。

- 桌面端有个独立的调度进程（`out/scheduler/index.js`），每 20 秒（`rX=2e4`）查一次 `~/.zcode/v2/tasks-index.sqlite` 的 `automations` 表，
  取 `enabled = 1 AND running = 0` 且 `next_run_at <= 现在` 的行（`runs/01`，`runs/02`），经主进程转给宿主进程执行（`runs/03`），
  执行出来的会话进侧栏，`target_task_id` 还能指定发进已有会话。所以往表里插一行「只跑一次、现在就跑」就能派任务
- ZCode agent 的 `CronCreate` 工具并不自己写这张表，而是请求客户端（桌面端）去建（`runs/04`，`requestClient(...automationCreate`），
  所以 CLI 无界面模式下用不了它
- 本机监听着的 `127.0.0.1:64725` 是宿主进程的媒体文件服务（`cloud_content_address`，根路径 404），不是接口（`runs/05`）；
  深链接只有打开工作区一种

写好的插入脚本 `automation-insert.cjs` 没有运行：用户在运行前否掉了，原话「不需要定时任务，就派发普通任务就行了，别搞复杂」。
派任务继续走调试端口那条路（`probes/2609291815_desktop-task-service`、`probes/2610021715_desktop-dispatch-full-access`）。

各份输出对应的命令：

```bash
node asar.mjs grep 'SELECT \* FROM automations' '^out/scheduler/index.js' 500 > runs/01-scheduler-claim-due.txt
node asar.mjs grep 'setInterval\(Jl,rX\)|var rX=2e4' '^out/scheduler/index.js' 120 > runs/02-poll-interval.txt
node asar.mjs grep 'cron-dispatch-request' '^out/main/index.js' 400 > runs/03-main-forwards-cron-run.txt
node cli-grep.mjs 'requestClient\([a-zA-Z]+\.automationCreate' 600 > runs/04-cron-create-asks-client.txt
node asar.mjs grep 'cloud_content_address' '^out/host/index.js' 400 > runs/05-port-is-media-server.txt
```

## 运行那次的环境

2026-10-02，Windows 11，ZCode 桌面端（安装包 `resources/glm/zcode.cjs` 0.16.9），Node 24.14.1。只读搜安装包，不涉及本仓代码。
