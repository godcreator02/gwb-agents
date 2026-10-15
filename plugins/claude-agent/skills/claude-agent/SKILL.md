---
name: claude-agent
description: 要把任务交给无界面的 Claude Code agent（经 Claude Agent SDK，可选本机 Claude 或 DeepSeek、GLM 等第三方模型）去做时读：claude-agent.create / send / status 怎么用、怎么选模型、怎么打断、怎么查进度。
---

# 用 claude-agent 派任务

`claude-agent.create` 新建一条会话开始第一轮，`claude-agent.send` 在会话上续一轮，`claude-agent.status` 读最新一轮的状态、回答与进度。会话没有界面，**发出去就返回，不等做完**；权限是完全放行（`bypassPermissions`），照常加载本机的 CLAUDE.md、MCP、hooks。
参数与回执字段用 `search {"prefix":"claude-agent."}` 看 usage。报错说没配 `sdk-dir`、SDK 版本不对、模型配置不对时读说明书 `claude-agent-setup`。

## 派一个任务

1. 选模型：`claude-agent.setup-status` 的 `models` 列着能用的配置名（`problem` 为 `null` 的）。不给 `model` 就用设置 `default-model`，那也空着就是本机已登录的 Claude
2. 写任务说明：在哪个目录、改哪些文件、要先读哪些规矩（目标仓的 `AGENTS.md`、相关说明书 `skill.read`）、做完怎么算完、要不要提交。agent 能调 gwb 的 MCP 入口
3. `claude-agent.create {"workspace":"<目录的绝对路径>","prompt":"<任务说明>","model":"<配置名>"}`，记下 `sessionId`
4. 轮询 `claude-agent.status {"workspace":"<同上>","sessionId":"<…>"}`：`status` 为 `running` 时 `progress` 有工具调用次数、最近的工具与最近一段回答；不是 `running` 就是这一轮结束了，`text` 是最终回答（`failed` 时是原因）
5. 复查：自己读改动、跑检查，不把回答里的「测试通过」当证据

**完成判据**：`status` 为 `completed`，复查通过。

## 续聊与打断

- 续一轮：`claude-agent.send {"workspace":…,"sessionId":…,"prompt":"…"}`，模型沿用会话建立时的那份，不能换
- 上一轮还在跑时 `send` 会报错；要放弃它改做别的，带 `"interrupt":true`：那一轮连同它开的命令一起结束、记 `failed`（原因写着被打断），再开这一轮。它正在跑数据迁移、写盘这类中途打断会留下半截结果的命令时别用
- 插件重载或工作台退出时在跑的一轮记 `failed`，不自动重发；会话照常能续

## 注意

- 同一个工作区可以同时开几条会话，插件不管占用：改不改到同一个文件由派任务的一方安排
- 插件不管回报：要 agent 做完通知谁，写进任务说明。别的插件要等一轮做完，用服务方法 `gwbClaudeAgent.waitRound`，不轮询 `status`
- 要人在界面上看着执行的活交给 ZCode（说明书 `zcode`）
