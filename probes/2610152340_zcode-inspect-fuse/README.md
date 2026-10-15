`node read-fuses.mjs <旧版 ZCode.exe> "$env:LOCALAPPDATA\Programs\ZCode\ZCode.exe"`，再在 ZCode 开着时 `node debug-process.mjs`

# ZCode 3.15.3 为什么不再接受 _debugProcess

2026-10-12 晚上起 gwb-zcode 派任务一律报 `The system cannot find the file specified.`：插件对 ZCode 主进程调
`process._debugProcess(pid)` 时就失败，9229 打不开。ZCode 10-13 已更新到 3.15.3。

- `read-fuses.mjs`：读 Electron 程序里的 fuse 位。旧版的 exe 从安装包里解出来：
  `7z e ZCode-3.10.2-win-x64.exe '$PLUGINSDIR\app-64.7z'`，再 `7z e app-64.7z ZCode.exe`
- `debug-process.mjs`：对每个运行中的 `ZCode.exe` 调一次 `_debugProcess`，列出接受与拒绝的进程。
  接受的进程会在 `127.0.0.1:9229` 开调试端口，随该进程退出关闭

## 记录

- `runs/01-fuses-3.10.2-vs-3.15.3.txt`：3.10.2 的 `EnableNodeCliInspectArguments` 是 enabled，3.15.3 是 disabled，其余 fuse 一样
- `runs/02-debug-process-3.15.3.txt`：3.15.3 的主进程、渲染进程、utility 进程都拒绝；只有以 RunAsNode 方式跑的
  `zcode.cjs` 子进程（app-server 与插件宿主）接受
- `runs/03-cdp-full-flow.txt`：ZCode 带 `--remote-debugging-port=9339` 重开后，隔离 home 里装开发版插件跑通
  open / create / status / send(interrupt) / archive 的回执摘录

## 怎么读

fuse 关掉后，Electron 初始化 Node 时不启动调试信号处理，主进程不创建 `node-debug-handler-<pid>` 这块命名共享内存；
Windows 上 `_debugProcess` 就是打开它，打不开报 ERROR_FILE_NOT_FOUND，也就是上面那句英文报错。
`--remote-debugging-port` 是 Chromium 的开关，不受这个 fuse 管；ZCode 打包版的主进程代码只在开发版里自己加
`remote-debugging-port=9229`，不会去掉用户给的这个参数。
