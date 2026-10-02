(async()=>{
 const svc=window.__zcodeBridgeServices;
 const task=window.__zcodeBridgeTestTask;
 const snapshot=await svc.zcodeAgentService.readSession({workspacePath:task.workspacePath,sessionId:task.taskId});
 const traceId=crypto.randomUUID();
 await svc.zcodeTaskService.sendPrompt({taskId:task.taskId,traceId,queryId:crypto.randomUUID(),messageId:crypto.randomUUID(),clientMode:'desktop-continuous',toolDenylist:['Bash','Write','Edit','NotebookEdit','Task','Agent'],content:'客户端代码派发测试 ZCODE-DESKTOP-0929。请不要调用任何工具，不读取或修改文件，不派其他代理。只回复：已收到客户端代码派发任务，测试代号 ZCODE-DESKTOP-0929。请在本会话记住代号，稍后将追问。 --block'});
 return {taskId:task.taskId,mode:snapshot.session.mode,traceId,sent:true};
})()
