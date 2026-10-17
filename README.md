# gwb-agents

在同一个仓库开发 GWB 的 agent 插件：

| 目录 | 包 | 原生入口 |
| --- | --- | --- |
| `plugins/zcode/` | `@godcreator/gwb-zcode` | 服务 `gwbZcode`：ZCode 桌面端的打开工作区、创建、续聊、查询、归档 |
| `plugins/claude-agent/` | `@godcreator/gwb-claude-agent` | 服务 `gwbClaudeAgent`：经 Claude Agent SDK 跑无界面的 agent 会话，模型可换 |
| `plugins/claudecode/` | `@godcreator/gwb-claudecode` | 已被 gwb-claude-agent 取代，不再维护 |

各插件保留自己的服务、命令、依赖、版本和安装入口。别的插件 inject 服务，agent 用同名命令（服务方法的薄封装）；QQ bot 独立于本仓，inject `gwbClaudeAgent` 派私聊里的任务。

## 开发

```powershell
pnpm install
pnpm build
pnpm check
```

单包操作用 `pnpm --filter @godcreator/gwb-zcode build` 或 `pnpm --filter @godcreator/gwb-claude-agent check`。
隔离 home 安装：`devkit.dev {"home":"<现场名>","dir":"<本仓绝对路径>","packages":["plugins/zcode","plugins/claude-agent"]}`。
包按各自变更独立发布；升版本前读 `gwb-release`。

文档站在 `docs-site/`，单独安装依赖，运行 `pnpm doc:render`、`pnpm doc`；历史实验与轨迹全部保留。
本仓沿用原 ZCode 的 Git 历史；远端与本地开发目录统一为 `gwb-agents`，各包都关联这个仓库。
