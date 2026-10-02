// 对一条会话先 setMode('build') 再 setMode('yolo')，每步之后读快照 meta.mode 与代理的 settings.mode.current
// 用法：node toggle-mode.mjs <sessionId> <工作区目录>
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
const agent = find.replace('zcodeTaskService;if(v)return v', 'zcodeAgentService;if(v)return v')
const both = async (label) => {
  const meta = await inWindow(`${find}.getTaskSnapshot(${JSON.stringify({ workspacePath: workspace, taskId, messageLimit: 5, clientMode: 'desktop-continuous' })}).then(s=>s.meta.mode)`)
  const agentMode = await inWindow(`Promise.resolve(${agent}.readSession(${JSON.stringify({ workspacePath: workspace, sessionId: taskId })})).then(s=>s.settings?.mode?.current)`)
  console.log(label, 'meta.mode=', meta, 'agent=', agentMode)
}
await both('before')
await inWindow(`Promise.resolve(${find}.setMode(${JSON.stringify({ taskId, mode: 'build' })})).then(()=>true)`)
await both('after build')
await inWindow(`Promise.resolve(${find}.setMode(${JSON.stringify({ taskId, mode: 'yolo' })})).then(()=>true)`)
await both('after yolo')
if (opened) await evaluate('setTimeout(()=>process.getBuiltinModule("inspector").close(),200); true')
ws.close()