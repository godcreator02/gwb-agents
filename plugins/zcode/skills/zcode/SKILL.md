---
name: zcode
description: 要把任务交给本机的 ZCode（另一个 AI 客户端，走 GLM 额度）去做时读：批量迁移、批量改代码、写文档站页面这类能写清范围的任务。讲 zcode.open / create / send / status / archive 怎么用、任务说明怎么写、怎么查询结果、做完怎么复查与归档，文档任务怎么验收。
---

# 给 ZCode 派任务

`zcode.open` 把 ZCode 窗口切到一个工作区，`zcode.create` 在 ZCode 桌面端新建一条会话发任务，`zcode.send` 在已有会话里接着发，`zcode.status` 读最新一轮做完没有、回答是什么，`zcode.archive` 把用完的会话移出侧栏的会话列表。
会话出现在 ZCode 侧栏里，用户能看着它执行、能在界面上接着聊；侧栏只显示窗口当前工作区的会话。派任务的两条都先把会话切到「完全访问」（改文件、运行命令都不先问人），**发出去就返回，不等做完**。
参数与回执字段用 `search {"prefix":"zcode."}` 看 usage。

## 派一个任务

1. 确认 ZCode 桌面端开着、只开了一个工作区窗口，并且是带 `--remote-debugging-port=9339` 启动的。没开、开了多个、没带这个参数，命令都会报错：
   请用户处理，没带参数的照报错里的命令关掉重开（ZCode 自动更新后重启会丢掉这个参数）。重开会中断 ZCode 里正在跑的会话，别替用户关 ZCode
2. 用户要在侧栏里看着它执行的，先 `zcode.open {"workspace":"<目录的绝对路径>"}` 把窗口切到下一步建会话用的同一个目录；
   用户正在 ZCode 里看别的工作区、没说要看的，不切
3. 写任务说明。ZCode 有完全访问权限，说明里写清：
   - 在哪个目录、改哪些文件，哪些不能碰
   - 要先读哪些规矩（目标仓的 `AGENTS.md`、相关说明书 `skill.read`；ZCode 接了 gwb 的 MCP 入口，能自己调命令）
   - 做完怎么算完：要跑的检查命令、交回什么（改了哪些文件、检查输出）
   - 不要提交、不要推送，除非这次就是要它提交
4. `run {"command":"zcode.create","args":{"workspace":"<目录的绝对路径>","prompt":"<任务说明>"}}`，记下回执里的 `taskId` 与 `waitCommand`
5. 在后台等它做完：Claude Code 里把 `waitCommand` 原样交给 Monitor 工具（`command` 填它，`timeout_ms` 填 1800000），接着去干别的。
   这一轮结束时 Monitor 收到一行 `ZCODE-ROUND-OVER {taskId,status,mode,pendingPermissions,lastReplyTail}`，脚本随即退出；出错收到一行 `ZCODE-WAIT-FAILED <原因>`。
   单次查询超时、连不上 MCP 入口，脚本自己隔 10 秒再查，连续 5 次都这样才报 `ZCODE-WAIT-FAILED`；收到它时会话多半还在跑，先用 `zcode.status` 核对，再用同一条 `waitCommand` 重开 Monitor。
   Monitor 到时限还没等到，就用同一条 `waitCommand` 再开一个。`waitCommand` 经本 home 的 gwb-mcp 命令行客户端调 `zcode.status`，home 里要装着 gwb-mcp。
   没有 Monitor 的客户端改成轮询：`zcode.status {"workspace":"<同上>","task":"<taskId>","waitSeconds":240}`，`roundIsOver` 为 `false` 就再调一次。
   `waitSeconds` 最多 240：MCP 客户端等一次调用有上限（Claude Code 是 300 秒）
6. 做完了用 `zcode.status`（不带 `waitSeconds`）读 `replies` 最后一条，再去复查（下一节）。ZCode 会把工具调用记录也写进回答，一轮看图、读文件多的回答能有几万字，
   回执超过 MCP 单次返回的上限就交不回来：这时带上 `"replyTailChars":20000`，只取回答末尾（收尾的总结在最后）

**完成判据**：`status` 回执 `roundIsOver` 为 `true`、`status` 为 `completed`、`mode` 为 `yolo`；复查通过。

## 在同一个会话里接着发

- 同一个会话续上：`zcode.send {"workspace":"<建它时的目录>","task":"<taskId>","prompt":"<接着做什么>"}`，ZCode 记得前面几轮；回执里同样有 `waitCommand`，照上面第 5 步在后台等
- 上一轮还没做完就 `send`，新指令排在后面，等这一轮做完才读到，回执 `roundStarted` 可能是 `false`：这时 `status` 读到的还是上一轮，
  `waitCommand` 等到的也是上一轮结束。收到结束那一行后用 `status` 看 `replies` 是不是回答这条指令的，不是就再开一次 `waitCommand`
- **派出去的任务要中途纠正**（说明写漏了、卡在没用的命令上）：`send` 带 `"interrupt":true`，不排队，当场取消它正在跑的命令、用这条指令开新的一轮，前面的上下文还在（同界面上排队消息的「立即」）。
  不带它的话，一个任务只有一轮时，纠正要等整个任务做完才送到。它正在跑数据迁移、写盘这类中途打断会留下半截结果的命令时别用；自己替它结束了卡住的进程，也要这样告诉它一声
- `pendingPermissions` 非空：停在等人确认，请用户去 ZCode 界面处理
- `status` 是 `failed` / `error`：读 `replies`，改说明后 `send` 重来

## 复查

ZCode 说「做完了」不算数：自己跑一次它说跑过的检查，`git diff` 看改动是不是在说好的范围里。批量任务至少抽查几项。

## 收尾：归档

复查过、不再接着用的会话：`zcode.archive {"workspace":"<建它时的目录>","task":"<taskId>"}`，移出 ZCode 侧栏的会话列表，记录不删。
还在跑的会话会报错，等 `status` 的 `roundIsOver` 为 `true` 再归档。用户还要在界面上看的，别替用户归档。

## 批量派任务

一项一个会话，可以先把几项都 `create` 出去（同一个工作区也行），每个会话各开一个 Monitor 等它的 `waitCommand`，几个会话同时等是可以的，不用自己另写轮流查询的脚本。
同时等的会话越多，ZCode 窗口要轮流回答，单次查询就越慢；等待脚本给单次查询留了余量，偶尔超时会自己重试（见「派一个任务」第 5 步）。
同一个 home 的命令共用连接，不同 home 各用自己的连接。命令结束只断开自己的连接，不会因为一个 home 完成查询而中断另一个 home。别把几十项塞进一个会话，上下文越来越长，后面容易乱。

遇到连接断开或请求超时，发送可能已经完成，先核对侧栏或已知会话的 `zcode.status`，不要直接重发任务。

## 交文档任务

写或改文档站页面（docfirst 站、普通 fumadocs 站、协作站）时，派任务的一方定设计、验收、提交，ZCode 照设计实现组件、写正文与钉码。

1. 派任务的一方先写好设计说明文件，写法见说明书 `docs-writing` 的「设计说明怎么写」。任务说明里写它的绝对路径，要求 ZCode 照做
2. 任务说明在「派一个任务」第 3 步之外写明：
   - 先读目标仓的 `AGENTS.md`，再读说明书 `docs-writing` 与 `docs-site`
   - **不做视觉自查**：不派 flashworker 这类看图的子代理，画面由派任务的一方验收
   - 做完按目标仓的规矩把站启动起来，确认页面能打开就回报；站保持运行，不要停
   - 不提交、不推送
   - 设计说明里的数值或行为跟代码对不上，就停下来写进回报，不自己改设计
   - 回报写：改了、加了哪些文件；检查命令最后几行原文；拿不准的地方；设计说明跟代码对不上的地方（没有就写没有）
3. `zcode.create` 派出去，照「派一个任务」第 5 步在后台等它做完
4. 截图验收，做法见说明书 `docs-site` 的「验收一页」，对照设计说明里的验收标准。问题逐条写清「哪里出了问题、要改成什么」，
   用 `zcode.send` 发回**同一个会话**，不另开：它记得设计说明和已经做过的改动。只改窄屏这类局部问题时写明「宽屏不要再动」。
   照第 3 步再等、再验，直到没有问题
5. 复查与提交归派任务的一方：在站目录自己重跑 ZCode 说跑过的检查，`git diff` 核对改动都在说好的范围里，再提交

## 并行与回报

同一个工作区可以同时开几条会话，插件不管占用：拆批量任务时让各会话改的文件互不重叠。
插件不参与回报：要不要回报、报给谁，由派任务的一方写进任务说明；这里只管派任务与查询。
