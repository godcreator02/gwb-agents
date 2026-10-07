`node send-command.mjs <工作区目录> <taskId> sendText '{"text":"…","requestedDelivery":"startNow","heldQueueDisposition":"keepQueueAndSend"}'`（要开着 ZCode 桌面端；找名字用 `node steer-names.mjs [正则] [文件过滤正则]`）

# 会话还在跑时，怎么让一条指令不排队、立即送到

## 问什么

`zcode.send` 经 `zcodeTaskService.sendPrompt` 发指令，会话还在跑时指令一律排进队列，要等这一轮做完才读到。
派出去的任务只有一轮时，中途纠正要等整个任务做完才送到。界面上排队消息有个「立即」按钮，它是怎么做到的、外部能不能照做。

## 怎么做

- `steer-names.mjs`：在 ZCode 安装包里找界面文字与函数名。「立即」（`chat.queue.sendNow`）的按钮调 `sendQueuedNow`，
  会话命令经 `zcodeAgentService.sendConversationCommandV4` 发出；`sendText` 命令的参数里有 `requestedDelivery`：`startNow` / `queue` / `guide`
- `send-command.mjs`：经 `sendConversationCommandV4` 发任意会话命令，CAS 命令拿到 stale 就用回执里的 revision 重发
- 建两条测试会话（任务是前台连跑两段 `sleep`），在 sleep 中间分别发 `guide`、`startNow`，再用 `zcode.status` 看它收到时在干什么

## 结论

- 信封的 `clientId` 要用窗口自己的（`localStorage` 的 `zcode-v4-client-id:v1`），自造的报 `fault.command.clientMismatch`
- `guide`：回执 `delivery: "queue"`，会话在跑命令时被降成排队
- `startNow`：回执 `delivery: "startNow"`，ZCode 当场取消正在跑的 `sleep`（工具结果写着命令被取消、子进程被要求停止，没有输出），用这条指令开新的一轮，前面的上下文还在
- `sendQueuedNow` 拿 `sendText` 回执里的 `inputId` 当队列项 id，报 `queue item text unavailable`；任务快照里也没有队列。按队列项「立即」这条路外部走不通，用 `startNow` 直接发

## 运行环境

2026-10-07，Windows 11，ZCode 桌面端（安装在 `%LOCALAPPDATA%\Programs\ZCode`），Node v24。
