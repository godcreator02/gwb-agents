`node --env-file=<含 DEEPSEEK_API_KEY 与 GLM_API_KEY 的文件> probe.mjs "%APPDATA%\npm\node_modules\@anthropic-ai\claude-agent-sdk"`（加 `--keep-session-env` 复现 runs/01；在 `%TEMP%` 这类不属于任何 node 项目的目录里运行）

## 问什么

本机已经登录 Claude 订阅时，不换 `CLAUDE_CONFIG_DIR`、照常加载本机的 Claude Code 设置，第三方模型的 token 放进 `ANTHROPIC_AUTH_TOKEN` 或 `ANTHROPIC_API_KEY` 能不能用上，还是会被本机登录盖掉。

## 怎么运行

见第一行。脚本对 DeepSeek（`deepseek-flash`）与 GLM（`glm-5.3`）各用两个变量名传 token，跑一轮不带工具的最小对话，打印 init 的模型与结果。默认去掉 Claude Code 桌面版给它启动的进程塞进来的会话变量（名字以 `CLAUDE`、`ANTHROPIC` 开头或是 `USE_*_OAUTH` 的，用户级环境变量里本来就有的 `CLAUDE_CODE_PLUGIN_DIRS`、`CLAUDE_CODE_USE_POWERSHELL_TOOL` 留着），模拟从开始菜单启动的工作台；`--keep-session-env` 保留它们。

## 结论

401 是会话变量造成的，不是本机登录本身。

- `runs/01-keep-session-env-killed.txt`：保留会话变量（这个脚本当时还没有去掉它们的那一步）。DeepSeek 用 `ANTHROPIC_AUTH_TOKEN` 回 401，报的 key 末四位是 `0AAA`；`ANTHROPIC_API_KEY` 那一组在会话记录里连续 401，末四位每次不同（`5AAA`、`qgAA`），是桌面版的登录凭据在刷新，重试了几分钟没有结束，手工结束了进程。会话变量里有 `CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH`、`CLAUDE_CODE_OAUTH_SCOPES`、`CLAUDE_CODE_ENTRYPOINT` 等。
- `runs/02-strip-session-env.txt`：去掉会话变量，四组全部 `success`。

所以插件给 SDK 子进程的环境要去掉这些会话变量；不必为第三方模型另开 `CLAUDE_CONFIG_DIR`，本机的 CLAUDE.md、MCP、hooks 照常加载。单元 k8pa2-agent-sdk-models 的 sdk-lab 当初也是从 Claude Code 会话里运行的，那里「要单独的 CLAUDE_CONFIG_DIR」的结论由这次实验更正。

## 运行那次的环境

2026-10-15，Windows 11 Pro 10.0.26200，Node v24.14.1，`@anthropic-ai/claude-agent-sdk@0.3.299`（附带 Claude Code 2.1.299），从 Claude Code 桌面版会话的 PowerShell 启动；gwb-agents 当时的提交 f69fdd9。
