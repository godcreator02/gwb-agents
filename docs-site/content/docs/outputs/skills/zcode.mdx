---
name: zcode
description: 要把活派给本机的 ZCode（另一个 AI 客户端，走 GLM 额度）去做时读：批量迁移、批量改代码这类能写清范围的活。讲 zcode.create / zcode.send 怎么用、任务说明怎么写、回执怎么读、做完怎么复查。
---

# 给 ZCode 派任务

`zcode.create` 在 ZCode 桌面端新建一条会话发任务，`zcode.send` 在已有会话里接着发。会话出现在 ZCode 侧栏里，用户能看着它干、能在界面上接着聊。
两条都先把会话切到「完全访问」（改文件、运行命令都不先问人），等这一轮做完才返回。参数与回执字段用 `search {"prefix":"zcode."}` 看 usage。

## 派一个任务

1. 确认 ZCode 桌面端开着、只开了一个工作区窗口。没开或开了多个，命令会报错，请用户处理
2. 写任务说明。ZCode 有完全访问权限，说明里写清：
   - 在哪个目录、改哪些文件，哪些不能碰
   - 要先读哪些规矩（目标仓的 `AGENTS.md`、相关说明书 `skill.read`；ZCode 接了 gwb 的 MCP 入口，能自己调命令）
   - 做完怎么算完：要跑的检查命令、交回什么（改了哪些文件、检查输出）
   - 不要提交、不要推送，除非这次就是要它提交
3. `run {"command":"zcode.create","args":{"workspace":"<目录的绝对路径>","prompt":"<任务说明>"}}`。长任务给 `timeoutSeconds`
4. 读回执：`status` 为 `completed` 且 `replies` 最后一条说做完了，再去复查（下一节）

**完成判据**：回执 `ok: true`、`status` 为 `completed`、`mode` 为 `yolo`；复查通过。

## 接着干、问进度

- 同一个会话续上：`zcode.send {"workspace":"<建它时的目录>","task":"<taskId>","prompt":"<接着做什么>"}`，ZCode 记得前面几轮
- 回执 `timedOut: true`：ZCode 还在做，任务没有取消。过一会儿 `zcode.send` 问一句进度，别重新 `create`
- `pendingPermissions` 非空：停在等人确认，请用户去 ZCode 界面处理

## 复查

ZCode 说「做完了」不算数：自己跑一次它说跑过的检查，`git diff` 看改动是不是在说好的范围里。批量任务至少抽查几项。

## 批量派活

一项一个会话、可以同时派几个：几条命令共用一个调试端口连接，互不影响。别把几十项塞进一个会话，上下文越拖越长，后面容易乱。
