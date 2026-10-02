# MCP 客户端等不了长命令：派任务改成发出即返回、轮询查结果

## 问什么

经 MCP 入口调一条要等很久的 gwb 命令（等 ZCode 做完一轮），客户端会不会一直等下去；不能的话，派任务的命令该怎么设计。

## 怎么运行

```bash
claude  # 在 Claude Code 里经 MCP 入口 run zcode.send，让 ZCode 运行 sleep 330 再回复（命令写在 runs/01 第二行）
```

要用 `@godcreator/gwb-zcode` 0.1.0（等做完才返回的那一版）才复现得出；0.2.0 起 `zcode.send` 发出即返回。`runs/` 是当时各步的回执原文，
02、03 里引用的两个只读脚本在 `probes/2610021715_desktop-dispatch-full-access/` 与 `probes/2610021800_mode-and-round-signals/`。

## 结论

Claude Code 对一次 MCP 调用 300 秒没有响应、也没有进度通知就放弃（`runs/01` 错误原文：`sent no response or progress for 300s; aborting`），
可以按服务器配 `timeout` 或设环境变量放宽。gwb 那边命令照常跑完、ZCode 也照常做完（`runs/02`：之后读到「睡醒了」），只是结果回不到 agent。
用户的判断：「应该在我们这轮询zcode或者挂个monitor吧？卡死等着肯定不对吧」。改成 `zcode.create` / `zcode.send` 发出后等这一轮开始就交回（实测 4.9 秒），
加 `zcode.status` 读最新一轮，`waitSeconds` 最多 240 秒、做完提前交回（`runs/03`）。

顺带发现：跑完一轮放了一阵子的会话，侧栏显示的模式会落回 `build`，代理仍是 `yolo`（`runs/02`）。所以模式一律报代理的 `settings.mode.current`，
显示落后时只在会话没在跑时拨一下让它跟上。

## 运行那次的环境

2026-10-02 18:20–19:01，Windows 11，Claude Code 桌面版（Opus 5.5），gwb 内核 0.10.1、gwb-mcp 0.11.6，ZCode 桌面端 3.14.4。
被测插件：default 上 `@godcreator/gwb-zcode` 0.1.0（本仓 commit `f6e6d3c`），以及其后的开发版。
