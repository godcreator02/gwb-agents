# gwb-agents

这份 AGENTS.md 由 `docs-site/content/docs/outputs/agents.mdx` 生成：改那份正本，再运行 `pnpm doc:render`。

本仓的 `plugins/zcode` 与 `plugins/claudecode` 是两个独立插件，各自维护服务、命令、版本和依赖；QQ 与协作站各自写执行端适配层接它们。

ZCode 插件 `@godcreator/gwb-zcode`（`plugins/zcode/`）：经 ZCode 工作区窗口页面的远程调试端口（ZCode 要带 `--remote-debugging-port=9339` 启动）调 ZCode 客户端的服务。本体是服务 `gwbZcode`（`open` 切窗口的工作区，`create` / `send` 派任务，`status` 读结果，`archive` 归档会话），同名的 `zcode.*` 五条命令是给 agent 的薄封装。

## ZCode 约束

- **权限一律完全访问（`yolo`）**：每次发指令前以代理的 `settings.mode.current` 为准切换并读回核对，不加模式参数
- **不一直等到 ZCode 做完**：派任务的命令发出即返回，`zcode.status` 的等待不超过 240 秒（Claude Code 等一次 MCP 调用 300 秒就放弃）；要等到底的交给回执里的 `waitCommand`，由 Claude Code 的 Monitor 在后台运行
- **只做切工作区、派任务、查结果、归档**：不加取消任务、列会话、取消归档之类的命令，除非用户要；还在跑的会话不归档；`zcode.create` 不替调用方切工作区
- **不用 ZCode CLI 无界面、不往 ZCode 的自动化表写行**：用户要侧栏看得见、不要绕路（理由见 `docs-site/content/trajectory/`）
- **ZCode 的内部结构集中在 `src/desktop.ts` 与 `src/round.ts`**：React 树路径、服务方法名、模式值、启动参数。ZCode 升级后先核对文档站「插件之间怎么连」那张约定通道表
- **服务名、方法与命令的参数、回执形状都是契约**：服务给 qq-bot 与协作站，命令给 agent；改了同时改说明书正本 `content/docs/outputs/skills/zcode.mdx`，按 gwb-release 判断升哪一位
- **服务是本体、命令是薄封装**：命令只查参数形状（认不出的键直接报错）再调同名服务方法；取值的含义在服务方法里查，不另写一份实现
- **不管占用、不参与回报**：同一个工作区可以并行；回报由派任务的一方写进提示词，插件不认识任何上层应用

## Claude Code 约束

- 实现在 `plugins/claudecode/`；使用原生 CLI 与本机登录、MCP 和纪律 hooks。
- 本体是服务 `gwbClaudecode`（`create` / `send` / `status`），`claudecode.*` 命令是薄封装；进程 result 事件更新本插件状态，回答原样保存。
- 插件卸载或工作台没正常退出中断的轮次一律记 failed，没有「状态不明」，不自动重发。

## 怎么跑

仓根：`pnpm build`、`pnpm check`（两个包各自运行 typecheck + oxlint + vitest）。只验证一个包用 pnpm --filter；隔离安装的 packages 选对应目录，可以一次选两个包。

- 插件在隔离 home 里验证：`devkit.dev {"home":"<home 名>","dir":"<仓根>","packages":["plugins/zcode"]}`，再用 `devkit.cdp` 调 `zcode.create` 派一个小任务、`zcode.status` 读结果，
  要开着 ZCode 桌面端；发版 `devkit.release {"dir":"<仓根>","packages":["plugins/zcode"]}`，升版本号前读说明书「gwb-release」
- 派出去的测试任务会真的花 ZCode 的模型额度、出现在用户的侧栏里，任务说明写明是测试、只做无害的事
- `probes/` 是实验材料，不进 workspace；每个目录的 README 第一行就是运行命令

写插件读 skill「gwb-devkit」，写文档读「docs-writing」，钉码核对与确认读「docs-site」，记轨迹读「trajectory」。

## 文档

文档站在 `docs-site/`：`pnpm doc` 检查；看页面先 `pnpm build` 再 `pnpm start`（http://127.0.0.1:4335），不用 `pnpm dev`。
仓根 README / AGENTS / CLAUDE 与随包说明书 `plugins/zcode/skills/zcode/SKILL.md` 都是生成物，正本在 `docs-site/content/docs/outputs/`。
改了被钉的代码，同一个提交里在站目录 `pnpm doc:confirm` 写回、逐条复核剩下的黄灯。
