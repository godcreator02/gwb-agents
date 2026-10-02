// Experimental adapter for the installed ZCode 3.14.4 desktop client.
// Uses its live task services. Does not write task databases or automate input.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: v, positionals } = parseArgs({ allowPositionals: true, options: {
  workspace: { type: 'string' }, task: { type: 'string' }, prompt: { type: 'string' },
  'prompt-file': { type: 'string' }, mode: { type: 'string', default: 'plan' },
  wait: { type: 'boolean', default: false }, timeout: { type: 'string', default: '180' },
} });
const action = positionals[0];
if (!['create', 'send', 'read'].includes(action) || !v.workspace || (action !== 'create' && !v.task)) {
  console.error('Usage: node zcode-desktop.mjs create|send|read --workspace PATH [--task ID] [--prompt TEXT|--prompt-file FILE] [--wait]');
  process.exit(1);
}
const prompt = v['prompt-file'] ? readFileSync(v['prompt-file'], 'utf8') : v.prompt;
if (action === 'send' && !prompt) throw new Error('send requires a prompt');
const pid = Number(execFileSync('pwsh', ['-NoProfile', '-Command',
  '$p = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "ZCode.exe" -and $_.CommandLine -notmatch "--type=|zcode.cjs|windows-helper" }); if ($p.Count -ne 1) { throw "Expected one ZCode main process" }; $p[0].ProcessId'
], { encoding: 'utf8', windowsHide: true }).trim());
if (!Number.isInteger(pid) || pid < 1) throw new Error('ZCode is not running');
let openedInspector = false;
let targets;
try { targets = await (await fetch('http://127.0.0.1:9229/json/list')).json(); }
catch {
  process._debugProcess(pid);
  openedInspector = true;
  for (let i = 0; i < 30; i++) {
    try { targets = await (await fetch('http://127.0.0.1:9229/json/list')).json(); break; }
    catch { await new Promise(r => setTimeout(r, 100)); }
  }
}
if (!targets?.[0]?.webSocketDebuggerUrl) throw new Error('Inspector unavailable');
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((r,j) => { ws.onopen=r; ws.onerror=j; });
let sequence=0;
const pending=new Map();
ws.onmessage=e=>{const x=JSON.parse(e.data);const cb=pending.get(x.id);if(cb){pending.delete(x.id);cb(x);}};
const rpc=(method,params)=>new Promise((resolve,reject)=>{
  const id=++sequence;
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error('RPC timed out; inspect task before retrying mutations'));},30000);
  pending.set(id,x=>{clearTimeout(timer);x.error?reject(new Error(JSON.stringify(x.error))):resolve(x.result);});
  ws.send(JSON.stringify({id,method,params}));
});
async function evaluate(expression) {
  const r=await rpc('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const electron='process.getBuiltinModule("module").createRequire(process.execPath)("electron")';
let windowId;
async function render(code) {
  return evaluate(`${electron}.BrowserWindow.fromId(${windowId}).webContents.executeJavaScript(${JSON.stringify(code)})`);
}
const serviceExpression=`(()=>{
 const root=document.getElementById('root');
 const key=Object.keys(root).find(k=>k.startsWith('__reactContainer'));
 const start=root[key], seen=new Set(), queue=[start,start?.stateNode?.current];
 while(queue.length){const f=queue.shift();if(!f||seen.has(f))continue;seen.add(f);
 const s=f.memoizedProps?.services;if(s?.zcodeTaskService)return s.zcodeTaskService;
 queue.push(f.child,f.sibling,f.alternate);}
 throw new Error('Client services unavailable');
})()`;
async function call(method,args) {
  return render(`${serviceExpression}[${JSON.stringify(method)}](${JSON.stringify(args)})`);
}
try {
  if(await evaluate('process.pid')!==pid)throw new Error('Port 9229 belongs to another process');
  const windows=await evaluate(`${electron}.BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('/out/renderer/index.html')).map(w=>w.id)`);
  if(windows.length!==1)throw new Error('Expected exactly one desktop workspace window');
  windowId=windows[0];
  let taskId=v.task;
  if(action==='create'){
    const t=await call('createTask',{workspacePath:v.workspace,mode:v.mode,v4Create:true});
    taskId=t.taskId;
    console.error(JSON.stringify({created:true,taskId,reportedMode:t.mode}));
  }
  let priorAssistantIds=new Set();
  if(action!=='read'&&prompt){
    // Resolve the task through the client before sending, including across restarts.
    const before=await call('getTaskSnapshot',{workspacePath:v.workspace,taskId,messageLimit:20,clientMode:'desktop-continuous'});
    priorAssistantIds=new Set(before.messages.filter(m=>m.role==='assistant').map(m=>m.id));
    await call('sendPrompt',{taskId,content:prompt,traceId:crypto.randomUUID(),queryId:crypto.randomUUID(),messageId:crypto.randomUUID(),clientMode:'desktop-continuous'});
    console.error(JSON.stringify({sent:true,taskId}));
  }
  const deadline=Date.now()+Number(v.timeout)*1000;
  for(;;){
    const s=await call('getTaskSnapshot',{workspacePath:v.workspace,taskId,messageLimit:20,clientMode:'desktop-continuous'});
    const out={taskId,title:s.meta.title,status:s.meta.status,reportedMode:s.meta.mode,messages:s.messages.map(m=>({id:m.id,role:m.role,content:m.content})),fileChanges:s.fileChanges,pendingPermissions:s.runtime?.pendingPermissions??[]};
    const terminal=['completed','idle','failed','error','cancelled'].includes(s.meta.status);
    const responseArrived=action==='read'||!prompt||out.messages.some(m=>m.role==='assistant'&&m.content&&!priorAssistantIds.has(m.id));
    const failure=['failed','error','cancelled'].includes(s.meta.status);
    if(!v.wait||(terminal&&(responseArrived||failure))||out.pendingPermissions.length||Date.now()>=deadline){
      if(v.wait&&Date.now()>=deadline)out.timedOut=true;
      console.log(JSON.stringify(out,null,2));break;
    }
    await new Promise(r=>setTimeout(r,2000));
  }
} finally {
  if(openedInspector) await evaluate('setTimeout(()=>process.getBuiltinModule("inspector").close(),200); true').catch(()=>{});
  ws.close();
}
