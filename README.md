# sdk-lab

用 Claude Agent SDK 跑一个最小的 agent 任务（读文件、改一行、跑一条命令），对比不同模型能不能完成。

```bash
pnpm install
node run.mjs claude
```

* `profiles.mjs`：每个模型一份配置，`model` 传给 SDK，`env` 覆盖子进程的环境变量（换模型就是在这里设 `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`）。密钥从本机环境变量读。
* `run.mjs`：每次运行先清空 `work/<profile>/` 再放进测试文件，跑完检查文件是否改对，没改对就以退出码 1 结束。
* 子进程不加载本机的 Claude Code 设置（`settingSources: []`），也去掉了 `CLAUDE_CODE_PLUGIN_DIRS`，只放开 Read、Edit、Write、Bash 四个工具。

## 结果

| profile | 模型 | 结果 | 工具调用 | 耗时 | 备注 |
| --- | --- | --- | --- | --- | --- |
| claude | claude-sonnet-5-5 | 通过 | Read → Edit → Bash | 33 秒 | 用本机 Claude Code 的登录，没设 API key；系统提示加工具定义约 3.5 万输入 token |
