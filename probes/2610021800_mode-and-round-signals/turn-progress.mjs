// 往一条会话发一条只读指令，之后每 250 毫秒读一次快照，只在有变化时打印：status、各条消息的长度、durationMs、parts 数
// 用法：node turn-progress.mjs <sessionId> <工作区目录>（会花 ZCode 的模型额度）
import { execFileSync } from 'node:child_process'
const [taskId, workspace] = process.argv.slice(2)
const pid = Number(execFileSync('pwsh', ['-NoProfile', '-Command', '(@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "ZCode.exe" -and $_.CommandLine -notmatch "--type=|zcode.cjs|windows-helper" }))[0].ProcessId'], { encoding: 'utf8' }).trim())
let opened = false
let targets
try { targets = await (await fetch('http://127.0.0.1:9229/json/list')).json() } catch {
  process._debugProcess(pid); opened = true
  for (let i = 0; i < 30 && !targets; i++) { await new Promise(r => setTimeout(r, 100)); try { targets = await (await fetch('http://127.0.0.1:9229/json/list')).json() } catch {} }
}
const ws = new WebSocket(targets[0].webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0; const pending = new Map()
ws.onmessage = e => { const x = JSON.parse(e.data); pending.get(x.id)?.(x); pending.delete(x.id) }
const evaluate = expression => new Promise(res => { const i = ++id; pending.set(i, x => res(x.result)); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })) })
const E = 'process.getBuiltinModule("module").createRequire(process.execPath)("electron")'
const win = (await evaluate(`${E}.BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('/out/renderer/index.html')).map(w=>w.id)`)).result.value[0]
const find = `(()=>{const root=document.getElementById('root');const k=Object.keys(root).find(k=>k.startsWith('__reactContainer'));const s=root[k],seen=new Set(),q=[s,s?.stateNode?.current];while(q.length){const f=q.shift();if(!f||seen.has(f))continue;seen.add(f);const v=f.memoizedProps?.services?.zcodeTaskService;if(v)return v;q.push(f.child,f.sibling,f.alternate);}})()`
const inWindow = async (code) => {
  const r = await evaluate(`${E}.BrowserWindow.fromId(${win}).webContents.executeJavaScript(${JSON.stringify(code)})`)
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}
const readMode = () => inWindow(`${find}.getTaskSnapshot(${JSON.stringify({ workspacePath: workspace, taskId, messageLimit: 5, clientMode: 'desktop-continuous' })}).then(s=>s.meta.mode)`)
const snap = () => inWindow(`${find}.getTaskSnapshot(${JSON.stringify({ workspacePath: workspace, taskId, messageLimit: 50, clientMode: 'desktop-continuous' })}).then(s=>JSON.stringify({status:s.meta.status,updatedAt:s.meta.updatedAt,runtime:{pendingCommands:(s.runtime?.pendingCommands??[]).length,apiRetry:s.runtime?.apiRetry??null},msgs:s.messages.map(m=>[m.role[0],m.id.slice(-6),(m.content??'').length,m.durationMs??null,(m.parts??[]).length])}))`)
const t0 = Date.now()
console.log('before', await snap())
await inWindow(`Promise.resolve(${find}.sendPrompt(${JSON.stringify({ taskId, content: '【gwb-zcode 插件验收，测试任务】只读：列出 vscode-workspace/ 目录下每个 .code-workspace 文件的文件名，每行一个，不要修改任何文件。', traceId: crypto.randomUUID(), queryId: crypto.randomUUID(), messageId: crypto.randomUUID(), clientMode: 'desktop-continuous' })})).then(()=>true)`)
let last = ''
while (Date.now() - t0 < 90000) {
  const s = await snap()
  if (s !== last) { console.log(`+${Date.now() - t0}ms`, s); last = s }
  await new Promise(r => setTimeout(r, 250))
}
if (opened) await evaluate('setTimeout(()=>process.getBuiltinModule("inspector").close(),200); true')
ws.close()