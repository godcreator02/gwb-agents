(async()=>{
 const task=await window.__zcodeBridgeServices.zcodeTaskService.createTask({workspacePath:'D:\\unitfolders\\00000-console\\console',mode:'plan',v4Create:true});
 window.__zcodeBridgeTestTask=task;
 return {taskId:task.taskId,workspacePath:task.workspacePath,mode:task.mode,title:task.title};
})()
