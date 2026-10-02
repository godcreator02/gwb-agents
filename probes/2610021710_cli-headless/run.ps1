# 用 ZCode 自带的 CLI 无界面跑一个只读任务：先不设环境变量（启动失败），再设上（跑通），最后查会话进没进桌面端侧栏
# 用法：pwsh ./run.ps1 [-Workspace <目录>]
param([string]$Workspace = 'D:\unitfolders\00000-console\console')
$ErrorActionPreference = 'Stop'
$zcode = "$env:LOCALAPPDATA\Programs\ZCode"
$cli = "$zcode\resources\glm\zcode.cjs"
$runs = Join-Path $PSScriptRoot 'runs'
$prompt = '只读任务：数一下 vscode-workspace/ 目录下有几个 .code-workspace 文件，用一句中文回答，不要修改任何文件。'

Remove-Item Env:ZCODE_BUILTIN_PROVIDER_CONFIG_FILE -ErrorAction SilentlyContinue
node $cli -p $prompt --cwd $Workspace --mode plan --json --no-color *> (Join-Path $runs '01-without-provider-env.txt')

$env:ZCODE_BUILTIN_PROVIDER_CONFIG_FILE = "$zcode\resources\config\provider\zcode-builtin.json"
node $cli -p $prompt --cwd $Workspace --mode plan --surface desktop --json --no-color > (Join-Path $runs '02-with-provider-env.json')

$sessionId = (Get-Content (Join-Path $runs '02-with-provider-env.json') -Raw | ConvertFrom-Json).sessionId
node (Join-Path $PSScriptRoot 'check-index.mjs') $sessionId > (Join-Path $runs '03-index-check.txt')
