import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import http from 'node:http';
import WebSocket,{WebSocketServer} from 'ws';
import {hashUser} from '../auth.mjs';
import assert from 'node:assert/strict';
const root=new URL('..',import.meta.url).pathname,dir=await mkdtemp(join(tmpdir(),'doom-link-browser-'));
let chrome,bridge,cdp,wss,daemon;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const requests=[];let upstream,rejectTurn=false,rejectResume=false,rejectRename=false,rejectArchive=false,holdArchive=false,releaseArchive;const archived=new Set();
try{
 const thread={id:'fixture-task',preview:'Browser fixture',cwd:'/tmp',turns:[{id:'fixture-turn',status:'completed',items:[{id:'message',type:'agentMessage',text:'Fixture task content [Example](https://example.com/path)'}]}]};
 const other={...thread,id:'other-task',preview:'Other task'};
 daemon=http.createServer();wss=new WebSocketServer({server:daemon});const socket=join(dir,'app.sock');await new Promise(r=>daemon.listen(socket,r));
 wss.on('connection',ws=>{upstream=ws;ws.on('message',raw=>{const m=JSON.parse(raw);requests.push(m);if(m.method==='thread/archive'){if(rejectArchive){ws.send(JSON.stringify({id:m.id,error:{code:-1,message:'Archive unavailable'}}));return;}const finish=()=>{archived.add(m.params.threadId);ws.send(JSON.stringify({method:'thread/archived',params:{threadId:m.params.threadId}}));ws.send(JSON.stringify({id:m.id,result:{}}));};if(holdArchive)releaseArchive=finish;else finish();return;}if(m.method==='thread/name/set'){if(rejectRename){ws.send(JSON.stringify({id:m.id,error:{code:-1,message:'Rename unavailable'}}));return;}(m.params.threadId==='other-task'?other:thread).name=m.params.name;}if(m.method==='thread/resume'&&rejectResume){ws.send(JSON.stringify({id:m.id,error:{code:-32602,message:'Fixture resume failed'}}));return;}if(m.method==='turn/start'&&rejectTurn){ws.send(JSON.stringify({id:m.id,error:{code:-32602,message:'Fixture mode unavailable'}}));return;}if(m.method&&m.id!==undefined){let result={};if(m.method==='thread/list')result={data:[{...thread,updatedAt:1},{...other,updatedAt:1}].filter(t=>!archived.has(t.id)),nextCursor:null};if(m.method==='model/list')result={data:[]};if(['thread/read','thread/resume','thread/start'].includes(m.method))result={thread,model:'fixture-model',reasoningEffort:'high'};if(m.method==='turn/start')result={turn:{id:'new-turn',status:'inProgress'}};ws.send(JSON.stringify({id:m.id,result}));}})});
 const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 await writeFile(join(dir,'config.json'),JSON.stringify({bind:['127.0.0.1'],port,socket}));
 await writeFile(join(dir,'users.json'),JSON.stringify({version:1,users:await Promise.all(['admin','user'].map(role=>hashUser({username:role,password:'browser-fixture',role})))}));
 bridge=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,DOOM_CONFIG:join(dir,'config.json'),DOOM_STATE_DIR:dir},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break}catch{}await sleep(50);}
 chrome=spawn('/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-extensions','--no-first-run','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',`--user-data-dir=${dir}/browser`,'about:blank'],{stdio:'ignore'});
 let debugPort;for(let i=0;i<100;i++){try{debugPort=(await readFile(join(dir,'browser/DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{}await sleep(100)}
 const targets=await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();const page=targets.find(t=>t.type==='page');cdp=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>cdp.once('open',r));
 let id=0;const pending=new Map(),errors=[];cdp.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});cdp.send(JSON.stringify({id:n,method,params}));});
 const js=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<100;i++){if(await js(expression))return;await sleep(100)}throw Error('Timeout: '+expression+' state='+JSON.stringify(await js('({url:location.href,error:document.querySelector("#login-error")?.textContent,notice:document.querySelector("#notice")?.textContent,connection:document.querySelector("#connection")?.textContent})')));};
 await call('Runtime.enable');await call('Page.enable');await call('Page.navigate',{url:`http://127.0.0.1:${port}`});await wait('typeof document.querySelector("#login-form")?.onsubmit==="function"');await sleep(300);
 const login=async role=>{await js(`document.querySelector('#username').value=${JSON.stringify(role)};document.querySelector('#password').value='browser-fixture';document.querySelector('#login-form').requestSubmit()`);await wait('!document.querySelector("#workspace").hidden && !!document.querySelector("#tasks button")');};
 await login('admin');await js('document.querySelector("#tasks button").click()');await wait('document.querySelector("#conversation").textContent.includes("Fixture task content")');
 await js(`document.querySelector('#prompt').value='Keep this draft';document.querySelector('#mode').value='plan'`);
 const menu=async id=>{await js(`document.querySelector('[data-id="${id}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:150}))`);};
 await menu('other-task');assert.equal(await js('!!document.querySelector("#context-archive")'),true,'Archive menu action exists');
 await js(`document.querySelector('#context-archive').click()`);assert.equal(await js('document.querySelector("#archive-dialog").open'),true);assert.match(await js('document.querySelector("#archive-name").textContent'),/Other task/);
 const before=requests.length;await js(`document.querySelector('#archive-cancel').click()`);assert.equal(requests.length,before,'cancel sends no request');
 await menu('other-task');await js(`document.querySelector('#context-archive').click()`);rejectArchive=true;await js(`document.querySelector('#archive-form').requestSubmit()`);await wait('document.querySelector("#archive-error").textContent.includes("Archive unavailable")');assert.equal(await js(`!!document.querySelector('[data-id="other-task"]')`),true);
 rejectArchive=false;holdArchive=true;const beforeSave=requests.filter(m=>m.method==='thread/archive').length;
 await js(`document.querySelector('#archive-form').requestSubmit();document.querySelector('#archive-form').requestSubmit()`);await wait('document.querySelector("#archive-confirm").disabled');await sleep(100);assert.equal(requests.filter(m=>m.method==='thread/archive').length,beforeSave+1);assert.equal(await js('document.querySelector("#archive-cancel").disabled'),true);releaseArchive();holdArchive=false;
 await wait('!document.querySelector("#archive-dialog").open');assert.equal(await js(`!!document.querySelector('[data-id="other-task"]')`),false);assert.equal(await js('document.querySelector("#task-title").textContent'),'Browser fixture');assert.equal(await js('document.querySelector("#prompt").value'),'Keep this draft');assert.equal(await js('document.querySelector("#mode").value'),'plan');assert.ok(!requests.slice(before).some(m=>['thread/resume','turn/start','turn/interrupt'].includes(m.method)));
 await js(`document.querySelector('#refresh').click()`);await sleep(150);assert.equal(await js(`!!document.querySelector('[data-id="other-task"]')`),false,'absent after refresh');
 await menu('fixture-task');await js(`document.querySelector('#context-archive').click();document.querySelector('#archive-form').requestSubmit()`);await wait('!document.querySelector("#archive-dialog").open');assert.equal(await js('document.querySelector("#task-title").textContent'),'Your next move.');assert.equal(await js('document.querySelector("#prompt").value'),'Keep this draft');assert.equal(await js('document.querySelector("#rename-task").hidden'),true);
 archived.clear();await js(`document.querySelector('#logout').click()`);await wait('!document.querySelector("#login").hidden');await login('user');await menu('other-task');assert.equal(await js('document.querySelector("#task-context-menu").hidden'),true);
 const denied=await js(`fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:'thread/archive',params:{threadId:'other-task'}})}).then(r=>r.status)`);assert.equal(denied,403);
 await js(`document.querySelector('#tasks button').click()`);await wait('document.querySelector("#conversation").textContent.includes("Fixture task content")');upstream.send(JSON.stringify({method:'thread/archived',params:{threadId:'fixture-task'}}));await wait(`!document.querySelector('[data-id="fixture-task"]')`);assert.equal(await js('document.querySelector("#task-title").textContent'),'Your next move.');
 assert.deepEqual(errors,[]);console.log('PASS Chromium archive: confirmation/cancel, retry, duplicate guard, selected/unselected state and draft, refresh persistence, read-only denial, live archive event.');
}finally{
 cdp?.close();chrome?.kill();bridge?.kill();for(const ws of wss?.clients||[])ws.terminate();wss?.close();daemon?.close();await sleep(500);await rm(dir,{recursive:true,force:true});
}
