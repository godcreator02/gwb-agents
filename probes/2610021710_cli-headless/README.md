# ZCode CLI 无界面派任务：能不能跑、桌面端看不看得到

## 问什么

用 ZCode 安装包里自带的 CLI（`resources/glm/zcode.cjs -p`）派一个任务，能不能跑通；跑出来的会话在 ZCode 桌面端侧栏里看不看得到。

## 怎么运行

```bash
pwsh ./run.ps1
```

会真的派一个只读小任务（花 ZCode 的模型额度）。三份输出写进 `runs/`：不设环境变量时的报错、设了以后的 JSON 回执、
用 `check-index.mjs <sessionId>` 只读查这条会话在会话库与侧栏索引里各有没有。

## 结论

能跑，但侧栏看不到。

- 直接用 node 运行会报 `无法定位 CLI ZCode Built-in Provider Config`（`runs/01-without-provider-env.txt`）：它按入口文件的相对路径找
  `zcode-builtin.json`，安装包里实际在 `resources/config/provider/`。设环境变量 `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` 指过去就行。
  `ZCode.exe` 是窗口程序，PowerShell 不等它结束也接不到输出，所以用普通 node 运行
- 设上以后 17 秒跑完，回执带 `sessionId` 与回答（`runs/02-with-provider-env.json`，回答「8 个」与实际一致）；stderr 只有一行
  `ZCode Built-in missing`，不影响
- 会话写进了共用的会话库 `~/.zcode/cli/db/db.sqlite`，但桌面端侧栏的索引 `~/.zcode/v2/tasks-index.sqlite` 里没有它
  （`runs/03-index-check.txt` 的 `inSidebarIndex` 为 null），`--surface desktop` 也不改变这一点。用的模型是 `deepseek-v4-flash`，
  不是 CLI 配置 `~/.zcode/cli/config.json` 里写的 GLM-5.3，从哪里取的没有查

用户看过结论后说：「就要走桌面端能看到的模式，cli无界面的话我看不见吧」。

## 运行那次的环境

2026-10-02，Windows 11，ZCode CLI `zcode.cjs` 0.16.9，Node 24.14.1。`runs/02` 是 17:12 那次实际运行的输出原样复制；
`runs/01`、`runs/03` 是 17:4x 重新运行生成的（01 不调模型，03 只读）。本仓当时还没有提交。
