# gwb-zcode

gwb 插件 `@godcreator/gwb-zcode`：让 agent 经 gwb 工作台给运行中的 ZCode 桌面端派任务。

- `zcode.create`：在一个工作区里新建会话、发出任务
- `zcode.send`：在已有会话里接着发指令
- `zcode.status`：读一个会话最新一轮做完没有、回答是什么
- `zcode.archive`：把用完的会话从 ZCode 侧栏收起来（记录不删）

派活的两条都先把会话切到 ZCode 的「完全访问」，发出就返回，结果用 `zcode.status` 轮询。会话出现在 ZCode 侧栏里，人能看着它干、能在界面上接着聊。ZCode 没有给外部用的建任务入口，
插件经 ZCode 主进程的 Node 调试端口调客户端自己的任务服务，依赖 ZCode 的内部结构，ZCode 升级后可能要跟着改。

用法读说明书 `zcode`（`skill.read {"name":"zcode"}`）；原理、接缝与取舍在文档站 `docs-site/`，实验材料在 `probes/`。

## 构建与检查

```powershell
pnpm install
pnpm build
pnpm check
```
