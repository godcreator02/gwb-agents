import fs from 'node:fs';
const targets = await (await fetch('http://127.0.0.1:9229/json/list')).json();
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
let seq=0;
const pending=new Map();
ws.onmessage=e=>{const x=JSON.parse(e.data);if(pending.has(x.id)){pending.get(x.id)(x);pending.delete(x.id)}};
async function rpc(method,params){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>reject(new Error('RPC timeout')),30000);pending.set(id,x=>{clearTimeout(timer);x.error?reject(new Error(JSON.stringify(x.error))):resolve(x.result)});ws.send(JSON.stringify({id,method,params}))})}
try {
 let expression=['--file','--renderer-file'].includes(process.argv[2])?fs.readFileSync(process.argv[3],'utf8'):process.argv[2];
 if(process.argv[2]==='--renderer-file') expression='__zbridgeElectron.BrowserWindow.fromId(1).webContents.executeJavaScript('+JSON.stringify(expression)+')';
 const result=await rpc('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 console.log(JSON.stringify(result,null,2));
}finally{ws.close()}
