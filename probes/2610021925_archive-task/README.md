# ZCode 的会话怎么归档

## 问什么

用户要求插件能归档已有的会话。ZCode 客户端的任务服务用哪个方法归档、参数与返回是什么、归档后怎么核对。

## 怎么运行

```bash
node archive-probe.mjs <sessionId> "D:\unitfolders\00000-console\console"
```

要开着 ZCode 桌面端；脚本经调试端口 9229 调客户端 `zcodeTaskService.archiveTask`，**中途报错时不关端口**，跑完用 `Get-NetTCPConnection -LocalPort 9229` 看一眼。
`runs/01` 是这个脚本对一条空测试会话的输出，`runs/02` 是写进插件以后在隔离 home 里的验收。

## 结论

`zcodeTaskService.archiveTask({ taskId, workspacePath })` 归档一条会话：侧栏索引 `tasks` 表的 `archived` 变成 1，`deleted` 仍是 0，会话记录不删。
它返回的任务信息里没有 `archived` 字段，读回核对改用同一个服务的 `listArchivedTasks({ workspacePath })`，看这条在不在里面。
对已经归档的再调一次照样成功。宿主进程里另有 `unarchiveTask`，用户没要，插件不做。

插件额外决定：还在跑（`status` 为 `running`）的会话不归档、直接报错——归档后它从侧栏消失，人就看不见它还在干活（`runs/02` 19:26:55）。

## 运行那次的环境

2026-10-02 19:23–19:28，Windows 11，ZCode 桌面端 3.14.4（安装包 `resources/glm/zcode.cjs` 0.16.9），Node 24.14.1。
被测插件是本仓 commit `616fb1c` 之后的工作区版本。
