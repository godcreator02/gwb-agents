`pnpm install --ignore-workspace; node --env-file-if-exists=api.txt run.mjs claude all; node summarize.mjs`（第三方模型先照 `api.txt.example` 写好 `api.txt`）

# sdk-lab

用 Claude Agent SDK 驱动不同模型做同一组 agent 任务，每个任务跑完自动检查，对比各模型能不能完成。

## 来源

原是单元 `D:\unitfolders\k8pa2-agent-sdk-models` 里的本机仓 `sdk-lab`（没有远端），2026-10-17 用不压缩的 `git subtree add` 并进本目录，
原来的三个提交 ed4defd、a9218c9、d0de3ec 原样留在本仓历史里；原仓整份备份在那个单元目录下的 `sdk-lab.bundle`。
轨迹卡 `2026-10-15-claude-agent-sdk` 写的是原路径。并入时只改了两处：工作目录从单元根 `../work` 挪到系统临时目录，安装加 `--ignore-workspace`，
别的文件与 `results/` 都是 2026-10-15 那次运行的原样。

```bash
pnpm install --ignore-workspace
node --env-file-if-exists=api.txt run.mjs claude all
node --env-file=api.txt run.mjs deepseek all
node --env-file=api.txt run.mjs glm bugfix subagents
node summarize.mjs
```

| 文件 | 作用 |
| --- | --- |
| `api.txt` | 第三方模型的密钥与模型名，已 gitignore，格式见 `api.txt.example` |
| `profiles.mjs` | 每个模型一份配置：`model` 传给 SDK，`env` 覆盖子进程的环境变量 |
| `tasks/` | 每个任务一个模块：`prompt`、`setup(workDir)` 布置初始文件、`check(workDir, trace)` 返回逐项检查 |
| `fixtures/` | 多文件任务和修 bug 任务的初始文件 |
| `run.mjs` | 跑任务，结果写进 `results/<profile>/<task>.json`（含每次工具调用） |
| `recheck.mjs` | 改了检查逻辑后，对已经跑完的工作目录重新检查，不重新调用模型 |
| `summarize.mjs` | 读 `results/` 打印对比表和没通过的检查项 |

agent 的工作目录在系统临时目录 `%TEMP%\sdk-lab-work\<profile>\<task>\`，每次运行前清空重建。

## 隔离与限制

* 子进程不加载本机的 Claude Code 设置（`settingSources: []`），去掉了 `CLAUDE_CODE_PLUGIN_DIRS`。
* 自动放行 Read、Bash、Glob、Grep、Agent；Write、Edit 经 `canUseTool` 检查，只放行工作目录以内的路径，越界的拒绝并记进结果的 `deniedWrites`。Bash 不受这个限制，agent 用 Bash 写文件（Claude 修 bug 时就是用 python heredoc 改的）照样能写到任何地方。
* 工作目录不放在任何 git 仓里：放在仓里时 agent 跑的 `git status` 看到的是那个仓本身。

## 第三方模型必须用单独的配置目录

本机 Claude Code 已登录 Claude 账号时，子进程会优先用这份登录凭据，`ANTHROPIC_AUTH_TOKEN` 不起作用：DeepSeek 和 GLM 都回 401，DeepSeek 报出的 key 末四位跟 api.txt 里的对不上。所以第三方模型的 profile 设了 `CLAUDE_CONFIG_DIR=<工作目录>/.claude-config-<profile>`，这是一个空目录，子进程读不到本机登录。

这一节的原因后来查明不对：401 来自 Claude Code 桌面版塞给子进程的会话变量，去掉以后不用单独的配置目录也行，见本仓 `probes/2610152150_third-party-auth/`。脚本保留当时的写法。

## 请求地址

| 模型 | `ANTHROPIC_BASE_URL` | 说明 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/anthropic` | 不认识的模型名会被换成 `deepseek-flash`，不报错 |
| GLM | `https://open.bigmodel.cn/api/anthropic` | 智谱文档给 Claude Code 推荐用 GLM Coding Plan 的 key |

## 任务

| 任务 | 要做什么 | 检查什么 |
| --- | --- | --- |
| smoke | 读 config.txt、改一行、用 node 读回确认 | 文件内容 |
| multi-file | `calcTotal` 改名 `computeTotal` 并加 `taxRate` 参数，改遍 5 个源文件和 README（其中一处是 `pricing.calcTotal` 命名空间调用），自己写测试 | src/ 与 README 不留旧名字；直接 import 改后的模块验证含税、不含税、透传；测试文件存在且 `node --test` 通过 |
| bugfix | 三个文件里藏 6 个 bug（排序按字典序、改了输入数组、偶数个中位数、百分位越界、slugify 不合并连字符、truncate 多一个字符、秒数字符串拼接、空串不报错），不许改测试 | 测试文件没改；`node --test` 通过；另有测试文件里没有的隐藏用例，抓针对测试的特判 |
| subagents | 三个日志文件各派一个自定义子代理 `log-counter` 并行统计，主代理汇总写 report.json；日志里有消息带 ERROR 字样的行，直接 `grep -c ERROR` 会数成三倍 | 派了三个子代理且在同一条回复里；主代理没自己读日志；三个文件的各级别行数与最多的 ERROR 消息 |

## 结果（2026-10-15）

| 任务 | 模型 | 检查通过 | 轮数 | 主代理工具调用 | 子代理工具调用 | 越界写入被拒 | 耗时（秒） | 主代理输入 token | 输出 token |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| smoke | claude-sonnet-5-5 | 1/1 | 4 | 3 | 0 | 0 | 18 | 104611 | 420 |
| smoke | deepseek-flash | 1/1 | 4 | 3 | 0 | 0 | 7 | 84302 | 334 |
| smoke | glm-5.3 | 1/1 | 4 | 3 | 0 | 0 | 25 | 83366 | 309 |
| multi-file | claude-sonnet-5-5 | 10/10 | 26 | 25 | 0 | 0 | 39 | 233745 | 3879 |
| multi-file | deepseek-flash | 10/10 | 23 | 22 | 0 | 0 | 24 | 243268 | 3632 |
| multi-file | glm-5.3 | 10/10 | 19 | 18 | 0 | 0 | 67 | 157868 | 2098 |
| bugfix | claude-sonnet-5-5 | 7/7 | 6 | 5 | 0 | 0 | 33 | 223156 | 1974 |
| bugfix | deepseek-flash | 7/7 | 16 | 15 | 0 | 0 | 25 | 167940 | 3538 |
| bugfix | glm-5.3 | 7/7 | 15 | 14 | 0 | 0 | 128 | 252926 | 5854 |
| subagents | claude-sonnet-5-5 | 7/7 | 3 | 5 | 3 | 1 | 29 | 122341 | 733 |
| subagents | deepseek-flash | 7/7 | 5 | 4 | 11 | 0 | 15 | 66974 | 1310 |
| subagents | glm-5.3 | 7/7 | 2 | 4 | 7 | 0 | 62 | 48479 | 422 |

三个模型、四个任务每次只跑了一遍，全部通过，这组任务还拉不开差距。观察到的差别：

* **都能用子代理**：DeepSeek 和 GLM 都在同一条回复里派出三个 `log-counter`，子代理也走的是同一个第三方模型（`CLAUDE_CODE_SUBAGENT_MODEL`），统计都避开了 `grep -c ERROR` 的坑。
* **Claude 两次把路径写错**：子代理任务里两次把 report.json 写到 `k8pa2-agent-sdk-models-sdk-lab\…`（把 `\sdk-lab` 拼成了 `-sdk-lab`），第一次没有拦截，在容器根下建出了一个目录；加了写入路径检查后被拒，随即改对。
* **工具用法不同**：Claude 修 bug 只用 Bash（读用 cat、改用 python 替换），5 次工具调用；DeepSeek、GLM 走 Read / Edit，各 14～15 次。
* **速度**：deepseek-flash 每个任务都最快；GLM 最慢，修 bug 用了 128 秒。
* 表里的输入 token 是 SDK 结果里主代理的 `usage`，包含缓存命中；子代理的用量不在里面。SDK 给的 `total_cost_usd` 一律按 Claude 价格算，第三方模型的费用看各家控制台。
* multi-file 的「不留旧名字」原来连测试文件一起查，DeepSeek 在测试里写了「旧名字已不存在」的断言而被误判，改成只查 src/ 与 README 后用 `recheck.mjs` 重算了三个模型的结果。
