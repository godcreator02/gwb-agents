// 给运行中的 ZCode 桌面端派任务：经主进程的 Node 调试端口调用客户端自己的 zcodeTaskService，任务出现在侧栏里。
// 依赖 ZCode 内部接口（React 树里的 services.zcodeTaskService），ZCode 升级后可能失效。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const usage = `用法：
  node zcode-desktop.mjs create --workspace <目录> (--prompt <文本> | --prompt-file <文件>) [--timeout <秒>]
  node zcode-desktop.mjs send --workspace <目录> --task <sess_...> (--prompt <文本> | --prompt-file <文件>) [--timeout <秒>]`;

const { values: options, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
  workspace: { type: 'string' }, task: { type: 'string' }, prompt: { type: 'string' },
  'prompt-file': { type: 'string' }, timeout: { type: 'string', default: '1800' },
} });
const action = positionals[0];
if (positionals.length !== 1 || !['create', 'send'].includes(action)) fail(`第一个参数必须是 create 或 send\n${usage}`);
if (!options.workspace) fail(`缺少 --workspace\n${usage}`);
if (action === 'send' && !options.task) fail(`send 需要 --task\n${usage}`);
if (action === 'create' && options.task) fail(`create 不接受 --task\n${usage}`);
if (Boolean(options.prompt) === Boolean(options['prompt-file'])) fail(`--prompt 与 --prompt-file 必须且只能给一个\n${usage}`);
const prompt = options.prompt ?? readFileSync(options['prompt-file'], 'utf8');
const timeoutSeconds = Number(options.timeout);
if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) fail(`--timeout 必须是正数（秒），收到 ${options.timeout}`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const inspectorListUrl = 'http://127.0.0.1:9229/json/list';
const finishedStatuses = ['completed', 'idle', 'failed', 'error', 'cancelled'];
const failedStatuses = ['failed', 'error', 'cancelled'];
const snapshotMessageLimit = 50;
const fullAccessMode = 'yolo';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function findZCodeMainProcessId() {
  const output = execFileSync('pwsh', ['-NoProfile', '-Command',
    '$p = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "ZCode.exe" -and $_.CommandLine -notmatch "--type=|zcode.cjs|windows-helper" }); if ($p.Count -ne 1) { throw "应有一个 ZCode 主进程，实际 $($p.Count) 个：ZCode 桌面端没开，或开了多个实例" }; $p[0].ProcessId',
  ], { encoding: 'utf8', windowsHide: true });
  return Number(output.trim());
}

async function listInspectorTargets() {
  const response = await fetch(inspectorListUrl);
  return response.json();
}

// 调试端口没开时 fetch 会连接失败，这时给主进程发信号打开它，结束时再关掉。
async function openInspector(processId) {
  try {
    return { targets: await listInspectorTargets(), openedByUs: false };
  } catch {
    process._debugProcess(processId);
    for (let attempt = 0; attempt < 30; attempt++) {
      await sleep(100);
      try { return { targets: await listInspectorTargets(), openedByUs: true }; } catch {}
    }
    throw new Error(`给 ZCode 主进程（pid ${processId}）打开调试端口后 3 秒内 ${inspectorListUrl} 仍连不上`);
  }
}

function connectInspector(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextRequestId = 0;
  const pendingRequests = new Map();
  socket.onmessage = event => {
    const reply = JSON.parse(event.data);
    pendingRequests.get(reply.id)?.(reply);
    pendingRequests.delete(reply.id);
  };
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextRequestId;
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`调试协议请求 ${method} 30 秒无响应；如果是发送指令，先去侧栏确认有没有发出去再重试`));
    }, 30000);
    pendingRequests.set(id, reply => {
      clearTimeout(timer);
      reply.error ? reject(new Error(JSON.stringify(reply.error))) : resolve(reply.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluateInMainProcess = async expression => {
    const result = await request('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  return new Promise((resolve, reject) => {
    socket.onopen = () => resolve({ evaluateInMainProcess, close: () => socket.close() });
    socket.onerror = () => reject(new Error(`连不上调试端口的 WebSocket：${webSocketUrl}`));
  });
}

const electronModule = 'process.getBuiltinModule("module").createRequire(process.execPath)("electron")';
const findTaskServiceInRenderer = `(()=>{
  const root=document.getElementById('root');
  const containerKey=Object.keys(root).find(k=>k.startsWith('__reactContainer'));
  const start=root[containerKey], seen=new Set(), queue=[start,start?.stateNode?.current];
  while(queue.length){const fiber=queue.shift();if(!fiber||seen.has(fiber))continue;seen.add(fiber);
    const service=fiber.memoizedProps?.services?.zcodeTaskService;if(service)return service;
    queue.push(fiber.child,fiber.sibling,fiber.alternate);}
  throw new Error('窗口的 React 树里找不到 services.zcodeTaskService，ZCode 内部结构可能变了');
})()`;

async function findWorkspaceWindowId(evaluateInMainProcess) {
  const windowIds = await evaluateInMainProcess(
    `${electronModule}.BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('/out/renderer/index.html')).map(w=>w.id)`);
  if (windowIds.length !== 1) throw new Error(`应有一个 ZCode 工作区窗口，实际 ${windowIds.length} 个`);
  return windowIds[0];
}

function taskServiceCaller(evaluateInMainProcess, windowId) {
  return (method, args) => evaluateInMainProcess(
    `${electronModule}.BrowserWindow.fromId(${windowId}).webContents.executeJavaScript(${JSON.stringify(
      `${findTaskServiceInRenderer}[${JSON.stringify(method)}](${JSON.stringify(args)})`)})`);
}

async function readSnapshot(callTaskService, taskId) {
  return callTaskService('getTaskSnapshot', {
    workspacePath: options.workspace, taskId, messageLimit: snapshotMessageLimit, clientMode: 'desktop-continuous',
  });
}

// 界面上的「完全访问」就是 yolo 模式；切完读回核对，没切成就不发任务。
async function switchToFullAccess(callTaskService, taskId) {
  await callTaskService('setMode', { taskId, mode: fullAccessMode });
  const mode = (await readSnapshot(callTaskService, taskId)).meta.mode;
  if (mode !== fullAccessMode) throw new Error(`会话 ${taskId} 切换到完全访问（${fullAccessMode}）后读回的模式是 ${mode}，已停止，任务没有发出`);
}

const assistantMessageIds = snapshot => new Set(snapshot.messages.filter(m => m.role === 'assistant').map(m => m.id));

async function sendPromptAndWait(callTaskService, taskId) {
  const assistantIdsBeforeSend = assistantMessageIds(await readSnapshot(callTaskService, taskId));
  await callTaskService('sendPrompt', {
    taskId, content: prompt, traceId: crypto.randomUUID(), queryId: crypto.randomUUID(),
    messageId: crypto.randomUUID(), clientMode: 'desktop-continuous',
  });
  console.error(JSON.stringify({ sent: true, taskId }));
  const deadline = Date.now() + timeoutSeconds * 1000;
  for (;;) {
    const snapshot = await readSnapshot(callTaskService, taskId);
    const newReplies = snapshot.messages
      .filter(m => m.role === 'assistant' && m.content && !assistantIdsBeforeSend.has(m.id))
      .map(m => m.content);
    const pendingPermissions = snapshot.runtime?.pendingPermissions ?? [];
    const status = snapshot.meta.status;
    const finished = finishedStatuses.includes(status) && (newReplies.length > 0 || failedStatuses.includes(status));
    const timedOut = Date.now() >= deadline;
    if (finished || pendingPermissions.length > 0 || timedOut) {
      return { taskId, title: snapshot.meta.title, status, mode: snapshot.meta.mode, replies: newReplies,
        fileChanges: snapshot.fileChanges, pendingPermissions, timedOut };
    }
    await sleep(2000);
  }
}

const processId = findZCodeMainProcessId();
const { targets, openedByUs } = await openInspector(processId);
const inspector = await connectInspector(targets[0].webSocketDebuggerUrl);
try {
  const inspectedProcessId = await inspector.evaluateInMainProcess('process.pid');
  if (inspectedProcessId !== processId) throw new Error(`9229 端口属于 pid ${inspectedProcessId}，不是 ZCode 主进程 ${processId}`);
  const callTaskService = taskServiceCaller(inspector.evaluateInMainProcess, await findWorkspaceWindowId(inspector.evaluateInMainProcess));
  let taskId = options.task;
  if (action === 'create') {
    taskId = (await callTaskService('createTask', { workspacePath: options.workspace, v4Create: true })).taskId;
    console.error(JSON.stringify({ created: true, taskId }));
  }
  await switchToFullAccess(callTaskService, taskId);
  const result = await sendPromptAndWait(callTaskService, taskId);
  console.log(JSON.stringify(result, null, 2));
  if (result.timedOut || result.pendingPermissions.length > 0 || failedStatuses.includes(result.status)) process.exitCode = 2;
} finally {
  if (openedByUs) await inspector.evaluateInMainProcess('setTimeout(()=>process.getBuiltinModule("inspector").close(),200); true');
  inspector.close();
}
