# 工作区目录删了的会话能不能归档

## 问什么

用户要求把 ZCode 里的会话全部归档，其中 8 条的工作区目录已经删了，插件 0.2.1 的 `zcode.archive` 要求目录存在、拒绝它们。ZCode 自己能不能归档这种会话。

## 怎么运行

```bash
node ../2610021925_archive-task/archive-probe.mjs <目录已删的会话 id> "<它原来的工作区目录>"
```

另用 `../2610021800_mode-and-round-signals/snapshot-meta.mjs` 读这种会话的快照。两个脚本中途报错时都不关 9229 端口，跑完看一眼。输出在 `runs/01-missing-workspace.txt`。

## 结论

能。目录删了的会话照样能读快照（`status` 为 `completed`），`archiveTask` 照样归档成功，侧栏索引 `archived` 变成 1。工作区路径只是 ZCode 记会话用的键，归档不在目录里干活。
所以插件 0.2.2 起 `zcode.archive` 不再查目录在不在，`create` / `send` 照旧要求目录存在（它们要让 ZCode 在目录里干活），`status` 这次没动。

## 运行那次的环境

2026-10-02 19:44，Windows 11，ZCode 桌面端 3.14.4，Node 24.14.1。被测插件是 default 上的 `@godcreator/gwb-zcode` 0.2.1（本仓 commit `f06fff4`）。
