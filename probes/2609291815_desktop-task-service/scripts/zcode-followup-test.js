(async()=>{
 const t=window.__zcodeBridgeTestTask;
 await window.__zcodeBridgeServices.zcodeTaskService.sendPrompt({taskId:t.taskId,traceId:crypto.randomUUID(),queryId:crypto.randomUUID(),messageId:crypto.randomUUID(),clientMode:'desktop-continuous',toolDenylist:['Bash','Write','Edit','NotebookEdit','Task','Agent'],content:'续问验证：上一轮的测试代号是什么？只回复代号，不调用工具，不读写文件。 --block'});
 return {taskId:t.taskId,sent:true};
})()
