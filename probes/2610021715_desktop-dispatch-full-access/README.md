# 桌面端派任务今天还能用吗、怎么让派过去的会话是「完全访问」

## 问什么

2026-09-29 Codex 写的那条代码路（经调试端口调客户端的 `zcodeTaskService`）在今天的 ZCode 上还能不能用；
派出去的会话实际跑在什么权限模式下，怎么保证是界面上的「完全访问」。

## 怎么运行

```bash
node zcode-desktop.mjs create --workspace "D:\unitfolders\00000-console\console" --prompt "记住暗号「玄鸟」。在 D:\tmp 下新建文件 probe.txt 写入 ok，然后告诉我做完了。"
```

要求 ZCode 桌面端开着、只有一个工作区窗口。`zcode-desktop.mjs` 是当天收进总控台仓 `tools/zcode/` 的版本：只有 `create` 与
`send --task <id>` 两个子命令，发指令前先 `setMode` 切到 `yolo` 并读回核对。其余几个只读脚本：

- `node check-sessions.mjs <sessionId…>`：查会话在侧栏索引里的标题、状态、模式，与会话库里记的执行模式（`runs/04`）
- `node asar.mjs grep '<正则>' '<文件过滤>' <上下文字符数>`：直接读 ZCode 安装包 `app.asar` 的文件表搜源码（`runs/05`、`runs/06`）

## 结论

能用，而且派出的会话进侧栏；但不做额外处理时它跑在 `build` 模式，也就是界面上的「变更前确认」，改文件前会停下等人点。

- 09-29 的脚本原样运行，31 秒建任务、发指令、读回，侧栏里出现「统计 vscode-workspace 目录下 .code-workspace 文件」
  （`runs/04` 第一行，`mode` 为 `build`、执行状态 `{"mode":"build","planEnabled":true}`）。给 `createTask` 传 `mode` 不起作用
- 界面上的五个模式名对应内部值：`build` 是「变更前确认」、`yolo` 是「完全访问」（`runs/05-mode-labels.txt`）
- 客户端任务服务有 `setMode({taskId, mode})`，ZCode 自己的机器人功能也用它把会话强制切到 yolo（`runs/06-set-mode.txt`）。
  发指令前调它、再读快照核对 `meta.mode`：新建的会话让它在临时目录写文件，没有停下来等确认，文件写进去了（`runs/02`）；
  拿原来跑在 `build` 下的旧会话续问，也切成了 `yolo`，并且记得上一轮的暗号「青鸾」（`runs/03`）。两条会话在侧栏索引里的模式都是
  `yolo`（`runs/04` 后两行）
- 调试端口用完会关掉：运行后 9229 没有在监听（`runs/03` 末行）

用户的要求原话：「发过去的权限必须是完全访问，不能是其他的」；功能只要两个：「你只要能派发最基础的会话干活，并且能对一个会话续上继续干，就这两个功能就行了」。

## 运行那次的环境

2026-10-02 17:14–17:36，Windows 11，ZCode 桌面端（安装包 `resources/glm/zcode.cjs` 0.16.9），Node 24.14.1。
`runs/01–03` 是当时运行的输出原样复制，`runs/04–06` 是 17:4x 只读重新生成的。`runs/01` 是加完全访问之前那一版脚本跑的；
本目录的 `zcode-desktop.mjs` 与总控台仓 commit `a32051c` 的 `tools/zcode/zcode-desktop.mjs` 相同。
