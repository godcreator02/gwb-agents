`node zcode-eval.mjs renderer current-workspace.js`（读 ZCode 窗口当前的工作区；切换本身见下面的步骤）

# ZCode 窗口能不能从外部切到另一个工作区

## 问什么

`zcode.create` 在 `D:\…\hybrid-mmc\collab` 建的会话，用户在 ZCode 侧栏里看不到：侧栏只显示窗口当前工作区的会话，而窗口开的是总控台。
用户要「用代码帮我在 ZCode 里打开那个项目」，不要点界面。要找一条从外部把窗口切到某个工作区的路，并能读回核对切成了没有。

## 怎么运行

要求 ZCode 桌面端开着、只有一个工作区窗口。

- `node zcode-eval.mjs (renderer|main) <脚本文件>`：在工作区窗口（渲染进程）或主进程里执行一段脚本、打印返回值，连接方式同插件的 `src/desktop.ts`
- `list-services.js`（renderer）：列出窗口 React 树上 `services` 的名字（`runs/01`）。服务是跨进程的代理对象，列不出方法名
- `node asar.mjs grep '<正则>' '<文件过滤>' <上下文字符数>`：直接读 ZCode 安装包 `app.asar` 搜源码（`runs/02`–`06`）
- `windows.js`（main）：列出 Electron 的全部窗口（`runs/07`）
- `current-workspace.js`（renderer）：统计 React 树里带 `workspacePath` / `activeWorkspacePath` 这类属性的组件，看窗口当前的工作区（`runs/08`）

切换那一步：

```powershell
node zcode-eval.mjs main windows.js
& "$env:LOCALAPPDATA\Programs\ZCode\ZCode.exe" --open-workspace "D:\unitfolders\b2o8l-sst-mmc-2026\hybrid-mmc\collab"
node zcode-eval.mjs main windows.js
node zcode-eval.mjs renderer current-workspace.js
```

## 结论

能切，用 ZCode 自己认的启动参数，不用碰内部服务。

- 主进程源码里有两个外部入口：启动参数 `--open-workspace <目录>`（`extractOpenWorkspacePathFromArgs`），深链接 `zcode://workspace/open?path=<目录>`
  （`isWorkspaceOpenUrl` / `extractWorkspaceOpenPath`），见 `runs/04`、`runs/06`。第二个实例把参数放进单实例数据（`createDeepLinkSingleInstanceData`）转给正在运行的那个
- 运行 `ZCode.exe --open-workspace <目录>` 后，第二个实例打印几行启动日志就退出；窗口数量前后都是 1，没有多开（`runs/07`）
- 窗口当前的工作区记在组件的 `activeWorkspacePath` 属性上，切换后 3 个组件的值都是 `hybrid-mmc\collab`（`runs/08`）。
  切换前没有单独存一份读数；切换前 ZCode 会话索引里最近的会话都在 `00000-console\console`，用户也说看不到 `hybrid-mmc\collab` 下的会话
- `windowControllerService` 这类服务在压缩后的代码里经解构调用，搜不到方法名（`runs/02` 为空），所以没走调服务这条路

## 运行那次的环境

2026-10-03 13:50–13:54，Windows 11，ZCode 3.14.4（Electron 41.0.3），Node 24.14.1。`runs/` 是当时运行的输出原样保存。
