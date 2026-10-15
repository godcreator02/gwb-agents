# sdk-lab

用 Claude Agent SDK 跑一个最小的 agent 任务（读文件、改一行、跑一条命令），对比不同模型能不能完成。

```bash
pnpm install
node --env-file-if-exists=api.txt run.mjs claude
node --env-file=api.txt run.mjs deepseek
node --env-file=api.txt run.mjs glm
```

* `api.txt`：第三方模型的密钥与模型名，已 gitignore，格式见 `api.txt.example`。
* `profiles.mjs`：每个模型一份配置，`model` 传给 SDK，`env` 覆盖子进程的环境变量。换第三方模型就是设 `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`，并把 opus、sonnet、haiku 三档和子代理的模型都指到同一个模型。
* `run.mjs`：每次运行先清空 `work/<profile>/` 再放进测试文件，跑完检查文件是否改对，没改对就以退出码 1 结束。
* 子进程不加载本机的 Claude Code 设置（`settingSources: []`），也去掉了 `CLAUDE_CODE_PLUGIN_DIRS`，只放开 Read、Edit、Write、Bash 四个工具。

## 第三方模型必须用单独的配置目录

本机 Claude Code 已登录 Claude 账号时，子进程会优先用这份登录凭据，`ANTHROPIC_AUTH_TOKEN` 不起作用：DeepSeek 和 GLM 都回 401，DeepSeek 报出的 key 末四位跟 api.txt 里的对不上。所以第三方模型的 profile 设了 `CLAUDE_CONFIG_DIR=work/.claude-config-<profile>`，这是一个空目录，子进程读不到本机登录。

## 请求地址

| 模型 | `ANTHROPIC_BASE_URL` | 说明 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/anthropic` | 不认识的模型名会被换成 `deepseek-flash`，不报错 |
| GLM | `https://open.bigmodel.cn/api/anthropic` | 智谱文档给 Claude Code 推荐用 GLM Coding Plan 的 key |

## 结果（2026-10-15）

| profile | 模型 | 结果 | 工具调用 | 耗时 | 输入 token（新输入 + 缓存命中） | 输出 token |
| --- | --- | --- | --- | --- | --- | --- |
| claude | claude-sonnet-5-5 | 通过 | Read → Edit → Bash | 33 秒 | 34759 写缓存 + 101219 | 386 |
| deepseek | deepseek-flash | 通过 | Read → Edit → Bash | 12 秒 | 18927 + 55168 | 325 |
| glm | glm-5.3 | 通过 | Read → Edit → Bash | 40 秒 | 17666 + 55616 | 323 |

* Claude 用的是本机 Claude Code 的登录，没设 API key。
* 三个模型都是 4 轮完成，工具参数一次就对。DeepSeek 和 GLM 的缓存都生效了（`cache_read_input_tokens` 不为 0）。
* SDK 汇总里的 `total_cost_usd` 一律按 Claude 的价格算，第三方模型的这个数没有意义，实际费用看各家控制台。
* 这个任务很简单，只能说明协议和工具调用走得通，不能比较模型能力。
