// 在运行中的 ZCode 工作区窗口（渲染进程）或主进程里执行一段脚本，打印返回值。只读探查用。
// 用法：node zcode-eval.mjs (renderer|main) <脚本文件>
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const [where, scriptFile] = process.argv.slice(2)
if (!['renderer', 'main'].includes(where) || !scriptFile) {
  console.error('用法：node zcode-eval.mjs (renderer|main) <脚本文件>')
  process.exit(1)
}
const script = readFileSync(scriptFile, 'utf8')

const inspectorListUrl = 'http://127.0.0.1:9229/json/list'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const electronModule = 'process.getBuiltinModule("module").createRequire(process.execPath)("electron")'

const processId = Number(execFileSync('pwsh', ['-NoProfile', '-Command',
  '$p = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "ZCode.exe" -and $_.CommandLine -notmatch "--type=|zcode.cjs|windows-helper" }); if ($p.Count -ne 1) { throw "应有一个 ZCode 主进程，实际 $($p.Count) 个" }; $p[0].ProcessId',
], { encoding: 'utf8', windowsHide: true }).trim())

async function listTargets() {
  return (await fetch(inspectorListUrl)).json()
}

let openedByUs = false
let targets
try {
  targets = await listTargets()
} catch {
  process._debugProcess(processId)
  openedByUs = true
  for (let attempt = 0; attempt < 30 && !targets; attempt++) {
    await sleep(100)
    try { targets = await listTargets() } catch {}
  }
  if (!targets) throw new Error('调试端口 3 秒内没打开')
}

const socket = new WebSocket(targets[0].webSocketDebuggerUrl)
let nextId = 0
const pending = new Map()
socket.onmessage = event => {
  const reply = JSON.parse(event.data)
  pending.get(reply.id)?.(reply)
  pending.delete(reply.id)
}
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
const evaluate = expression => new Promise((resolve, reject) => {
  const id = ++nextId
  pending.set(id, reply => {
    if (reply.error) return reject(new Error(JSON.stringify(reply.error)))
    if (reply.result.exceptionDetails) return reject(new Error(reply.result.exceptionDetails.exception?.description ?? reply.result.exceptionDetails.text))
    resolve(reply.result.result.value)
  })
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
})

try {
  if (await evaluate('process.pid') !== processId) throw new Error('9229 端口不是 ZCode 主进程')
  let expression = script
  if (where === 'renderer') {
    const windowIds = await evaluate(`${electronModule}.BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('/out/renderer/index.html')).map(w=>w.id)`)
    if (windowIds.length !== 1) throw new Error(`应有一个工作区窗口，实际 ${windowIds.length} 个`)
    expression = `${electronModule}.BrowserWindow.fromId(${windowIds[0]}).webContents.executeJavaScript(${JSON.stringify(script)})`
  }
  console.log(JSON.stringify(await evaluate(expression), null, 2))
} finally {
  if (openedByUs) await evaluate('setTimeout(()=>process.getBuiltinModule("inspector").close(),200); true')
  socket.close()
}
