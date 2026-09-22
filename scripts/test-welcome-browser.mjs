import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import http from 'node:http';
import WebSocket,{WebSocketServer} from 'ws';
import {hashUser} from '../auth.mjs';
import assert from 'node:assert/strict';
const root=new URL('..',import.meta.url).pathname,dir=await mkdtemp(join(tmpdir(),'doom-welcome-browser-'));
let chrome,bridge,cdp,wss,daemon;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const requests=[];let upstream;
try{
 const thread={id:'fixture-task',preview:'Browser fixture',cwd:'/tmp',turns:[{id:'fixture-turn',status:'completed',items:[{id:'message',type:'agentMessage',text:'Fixture task content [Example](https://example.com/path)'}]}]};
 const other={...thread,id:'other-task',preview:'Other task'};
 daemon=http.createServer();wss=new WebSocketServer({server:daemon});const socket=join(dir,'app.sock');await new Promise(r=>daemon.listen(socket,r));
 wss.on('connection',ws=>{upstream=ws;ws.on('message',raw=>{const m=JSON.parse(raw);requests.push(m);if(m.method&&m.id!==undefined){let result={};if(m.method==='thread/list')result={data:[{...thread,updatedAt:1},{...other,updatedAt:1}],nextCursor:null};if(m.method==='model/list')result={data:[]};if(['thread/read','thread/resume','thread/start'].includes(m.method))result={thread,model:'fixture-model',reasoningEffort:'high'};if(m.method==='turn/start')result={turn:{id:'new-turn',status:'inProgress'}};ws.send(JSON.stringify({id:m.id,result}));}})});
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
 const login=async role=>{await call('Page.navigate',{url:`http://127.0.0.1:${port}`});await wait('typeof document.querySelector("#login-form")?.onsubmit==="function"');await wait('!document.querySelector("#login").hidden');await js('fetch("/api/status").then(r=>r.json())');await js(`document.querySelector('#username').value=${JSON.stringify(role)};document.querySelector('#password').value='browser-fixture';document.querySelector('#login-form').requestSubmit()`);await wait('!document.querySelector("#workspace").hidden && !!document.querySelector("#tasks button")');};
 const evidence=new URL('../docs/ui-evidence/welcome-panel/',import.meta.url).pathname;
 const capture=async name=>{if(process.env.CAPTURE_UI!=='1')return;await mkdir(evidence,{recursive:true});await js('document.fonts.ready');const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(evidence,name+'.png'),Buffer.from(shot.data,'base64'));};
 const size=async(width,height,mobile=true)=>{await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await call('Emulation.setTouchEmulationEnabled',{enabled:mobile});await sleep(100);};
 const tap=async selector=>{const point=await js(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(80);};
 const fits=async()=>assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true,'no horizontal page overflow');
 const escape=async()=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});};
 const welcome=async role=>{
  assert.equal(await js('document.querySelectorAll("#conversation .welcome").length'),1,'exactly one welcome');
  assert.equal(await js('document.querySelector(".welcome h2").textContent'),'Ready when you are');
  assert.equal(await js('document.querySelector(".welcome p").textContent'),role==='admin'?'Choose a task from navigation, or write a prompt below to start.':'Choose a task from navigation to view the conversation.');
  assert.equal(await js('document.querySelectorAll("#conversation .message").length'),0,'no stale messages');
  assert.equal(await js('document.querySelector("#task-meta").textContent'),role==='admin'?'Choose a task or start something new.':'Choose a task from navigation.');
  await fits();
 };
 const navigate=async selector=>{
  if(await js('innerWidth<1024'))await tap('#navigation-toggle');
  await tap(selector);
  if(selector==='#refresh'&&await js('document.querySelector("#navigation-dialog").open'))await escape();
  await wait('!document.querySelector("#navigation-dialog").open');
 };
 const sendReachable=async()=>{
  assert.equal(await js('(()=>{const r=document.querySelector("#send").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})()'),true,'Send remains reachable');
 };
 const upload=async()=>{
  await js(`(()=>{const data=new DataTransfer();data.items.add(new File(['Synthetic attachment'], 'notes.txt', {type:'text/plain'}));document.querySelector('#file-input').files=data.files;document.querySelector('#file-input').dispatchEvent(new Event('change'));})()`);
  await wait('document.querySelector("#attachments").textContent.includes("notes.txt")&&!document.querySelector("#send").disabled');
 };
 for(const [name,width,height] of [['desktop',1440,900],['phone',390,844],['small-phone',320,568]]){
  await size(width,height,width<1024);await login('admin');await welcome('admin');await sendReachable();await capture(name+'-admin-welcome');
  await js(`document.querySelector('#prompt').value='Synthetic draft';document.querySelector('#mode').value='plan';document.querySelector('#mode').dispatchEvent(new Event('change'))`);
  await upload();
  await navigate('#refresh');await welcome('admin');
  assert.equal(await js('document.querySelector("#prompt").value'),'Synthetic draft');
  assert.equal(await js('document.querySelector("#mode").value'),'plan');
  assert.match(await js('document.querySelector("#attachments").textContent'),/notes.txt/);
  await navigate('#tasks button');await wait('document.querySelector("#conversation").textContent.includes("Fixture task content")');
  assert.equal(await js('document.querySelectorAll(".welcome").length'),0);
  assert.equal(await js('document.querySelector("#prompt").value'),'Synthetic draft');
  assert.equal(await js('document.querySelector("#mode").value'),'default','existing task-selection reset');
  assert.equal(await js('document.querySelector("#attachments").children.length'),0,'existing task-selection attachment reset');
  await fits();await sendReachable();await capture(name+'-selected-conversation');
  await upload();await js(`document.querySelector('#mode').value='plan';document.querySelector('#mode').dispatchEvent(new Event('change'))`);
  for(let i=0;i<3;i++){
   await navigate('#new-task');await welcome('admin');await sendReachable();
   assert.equal(await js('document.querySelector("#prompt").value'),'Synthetic draft');
   assert.equal(await js('document.querySelector("#mode").value'),'default','existing New task mode reset');
   assert.equal(await js('document.querySelector("#attachments").children.length'),0,'existing New task attachment reset');
   assert.equal(await js('document.activeElement.id'),'prompt','existing New task focus');
  }
  upstream.send(JSON.stringify({method:'item/agentMessage/delta',params:{threadId:'fixture-task',itemId:'message',delta:' Late fixture update.'}}));
  await sleep(100);await welcome('admin');
  await navigate('#logout');await wait('!document.querySelector("#login").hidden');
  await login('user');await welcome('user');assert.equal(await js('document.querySelector("#composer").hidden'),true);assert.equal(await js('document.querySelector("#new-task").hidden'),true);await capture(name+'-read-only-welcome');
  const writesBefore=requests.filter(m=>m.method==='thread/resume'||m.method==='turn/start').length;
  await navigate('#tasks button');await wait('document.querySelector("#conversation").textContent.includes("Fixture task content")');await fits();
  assert.equal(await js('document.querySelectorAll(".welcome").length'),0);
  assert.equal(requests.filter(m=>m.method==='thread/resume'||m.method==='turn/start').length,writesBefore,'read-only selection does not write');
  await navigate('#logout');await wait('!document.querySelector("#login").hidden');
 }
 assert.deepEqual(errors,[]);console.log('PASS welcome Chromium: admin/read-only sign-in, role copy, selected conversation, repeated New task, draft/mode/attachment semantics, desktop/phone/small-phone sizing and reachable Send.');
}finally{
 cdp?.close();chrome?.kill();bridge?.kill();for(const ws of wss?.clients||[])ws.terminate();wss?.close();daemon?.close();await sleep(500);await rm(dir,{recursive:true,force:true});
}
