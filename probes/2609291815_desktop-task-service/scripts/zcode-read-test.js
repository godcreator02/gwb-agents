(async()=>{
 const t=window.__zcodeBridgeTestTask;
 const s=await window.__zcodeBridgeServices.zcodeTaskService.getTaskSnapshot({taskId:t.taskId,workspacePath:t.workspacePath,messageLimit:10,clientMode:'desktop-continuous'});
 return {meta:s.meta,messages:s.messages.map(m=>({id:m.id,role:m.role,content:m.content,toolCalls:m.toolCalls})),fileChanges:s.fileChanges,pendingPermissions:s.runtime?.pendingPermissions};
})()
