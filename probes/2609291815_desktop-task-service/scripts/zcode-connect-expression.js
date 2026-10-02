__zbridgeElectron.BrowserWindow.fromId(1).webContents.executeJavaScript(`
(() => {
 const root=document.getElementById('root');
 const key=Object.keys(root).find(k=>k.startsWith('__reactContainer'));
 const start=root[key];
 const seen=new Set(); const queue=[start,start?.stateNode?.current];
 while(queue.length){const f=queue.shift();if(!f||seen.has(f))continue;seen.add(f);
 const s=f.memoizedProps?.services;
 if(s?.zcodeTaskService){window.__zcodeBridgeServices=s;return {found:true,keys:Object.keys(s)};}
 queue.push(f.child,f.sibling,f.alternate);
 }
 return {found:false,key,visited:seen.size};
})()
`)
