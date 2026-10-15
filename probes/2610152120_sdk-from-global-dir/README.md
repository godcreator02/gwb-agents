`node probe.mjs "%APPDATA%\npm\node_modules\@anthropic-ai\claude-agent-sdk"`（先 `npm install -g @anthropic-ai/claude-agent-sdk@0.3.299`；在不属于任何 node 项目的目录里运行，比如 `%TEMP%`）

## 问什么

插件不打包 SDK、只拿到用户装的 SDK 包目录时，按文件路径动态 `import` 能不能用，跑起来的是不是 SDK 自带的那份 Claude Code。

## 怎么运行

见第一行。脚本读 SDK 的 `package.json` 打印版本与 `claudeCodeVersion`，按 `sdk.mjs` 的文件 URL 动态 `import`，用本机登录跑一轮不带工具（`tools: []`）、只问一句的对话，打印 init 消息里的 `claude_code_version` 与结果。

## 结论

能用。`runs/01-global-npm.txt`：SDK 0.3.299 的 `package.json` 写着配套 Claude Code 2.1.299，init 消息报的 `claude_code_version` 也是 2.1.299，结果 `success`、文本 `ok`、约 15 秒。本机 `.local\bin\claude.exe` 当时是 2.1.288，没有被用到。npm 全局安装时平台包 `@anthropic-ai/claude-agent-sdk-win32-x64` 装在 SDK 自己的 `node_modules` 下，所以只给 SDK 包目录就够了。

## 运行那次的环境

2026-10-15，Windows 11 Pro 10.0.26200，Node v24.14.1，npm 全局目录 `%APPDATA%\npm\node_modules`，`@anthropic-ai/claude-agent-sdk@0.3.299`；gwb-agents 当时的提交 f69fdd9。
