// 对每个运行中的 ZCode.exe 调一次 process._debugProcess，看哪些进程还接受打开 Node 调试端口
// 副作用：接受的进程会在 127.0.0.1:9229 上开调试端口，随该进程退出关闭
import { execFileSync } from 'node:child_process'

const listing = execFileSync('pwsh', ['-NoProfile', '-Command',
  'Get-CimInstance Win32_Process | Where-Object Name -eq "ZCode.exe" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'],
{ encoding: 'utf8' })
const processes = [JSON.parse(listing)].flat()
if (processes.length === 0) throw new Error('没有运行中的 ZCode.exe')
for (const { ProcessId, CommandLine } of processes) {
  const kind = /--type=(\S+)/.exec(CommandLine)?.[1] ?? (CommandLine.includes('zcode.cjs') ? 'zcode.cjs 子进程' : '主进程')
  let outcome
  try {
    process._debugProcess(ProcessId)
    outcome = '接受'
  } catch (error) {
    outcome = `拒绝：${error.message}`
  }
  console.log(`${ProcessId}\t${kind}\t${outcome}`)
}
