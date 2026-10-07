// 经 zcodeAgentService.sendConversationCommandV4 发任意一条会话命令，clientId 用窗口自己的，打印 ZCode 的回执。
// 用法：node send-command.mjs <工作区目录> <taskId> <命令类型> <payload JSON> [baseRevision]
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const [workspacePath, sessionId, type, payloadJson, baseRevision] = process.argv.slice(2)
if (!workspacePath || !sessionId || !type || !payloadJson) {
  console.error('用法：node send-command.mjs <工作区目录> <taskId> <命令类型> <payload JSON> [baseRevision]')
  process.exit(1)
}
const envelope = {
  commandId: randomUUID(),
  sessionId,
  ...(baseRevision === undefined ? {} : { baseRevision: Number(baseRevision) }),
  type,
  payload: JSON.parse(payloadJson),
  issuedAt: Date.now(),
}
const script = `(async()=>{
  const root=document.getElementById('root');
  const containerKey=Object.keys(root).find(k=>k.startsWith('__reactContainer'));
  const start=root[containerKey], seen=new Set(), queue=[start,start?.stateNode?.current];
  let service;
  while(queue.length){const fiber=queue.shift();if(!fiber||seen.has(fiber))continue;seen.add(fiber);
    service=fiber.memoizedProps?.services?.zcodeAgentService;if(service)break;
    queue.push(fiber.child,fiber.sibling,fiber.alternate);}
  const request=${JSON.stringify({ workspacePath, clientMode: 'desktop-continuous', envelope })};
  request.envelope.clientId=localStorage.getItem('zcode-v4-client-id:v1');
  if(!request.envelope.clientId)throw new Error('窗口 localStorage 里没有 zcode-v4-client-id:v1');
  // CAS 命令：revision 过期回 stale，就用回执里的 revisionAtDecision 换新 commandId 重发，最多 5 次
  const replies=[];
  for(let attempt=0;attempt<5;attempt++){
    const reply=await service.sendConversationCommandV4(request);replies.push(reply);
    if(reply.status!=='stale'||request.envelope.baseRevision===undefined)return replies;
    request.envelope={...request.envelope,commandId:crypto.randomUUID(),baseRevision:reply.revisionAtDecision,issuedAt:Date.now()};
  }
  return replies;
})()`
const file = new URL('./send-command.generated.js', import.meta.url)
writeFileSync(file, script)
console.log(execFileSync(process.execPath, [new URL('./zcode-eval.mjs', import.meta.url).pathname.slice(1), 'renderer', file.pathname.slice(1)], { encoding: 'utf8' }))
