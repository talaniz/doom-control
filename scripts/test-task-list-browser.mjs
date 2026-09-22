import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
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
const requests=[];let created;let upstream,rejectTurn=false,rejectResume=false,rejectRename=false,listRows,listCursor=null,holdList=false,rejectList=false;const held=[];
try{
 const thread={id:'fixture-task',preview:'Browser fixture',cwd:'/tmp',turns:[{id:'fixture-turn',status:'completed',items:[{id:'message',type:'agentMessage',text:'Fixture task content [Example](https://example.com/path)'}]}]};
 const other={...thread,id:'other-task',preview:'Review diagnostic test ordinary user work',source:'cli'};
 const internal=['implementation','code-review','e2e-review','diagnostic','probe'].map(id=>({...thread,id,originator:'prime_mover',preview:'Synthetic internal fixture'}));
 listRows=[thread,other,...internal];
 daemon=http.createServer();wss=new WebSocketServer({server:daemon});const socket=join(dir,'app.sock');await new Promise(r=>daemon.listen(socket,r));
 wss.on('connection',ws=>{upstream=ws;ws.on('message',raw=>{const m=JSON.parse(raw);requests.push(m);if(m.method==='thread/list'&&holdList){held.push([ws,m.id]);return;}if(m.method==='thread/list'&&rejectList){ws.send(JSON.stringify({id:m.id,error:{code:-1,message:'Fixture unavailable'}}));return;}if(m.method==='thread/name/set'){if(rejectRename){ws.send(JSON.stringify({id:m.id,error:{code:-1,message:'Rename unavailable'}}));return;}(m.params.threadId==='other-task'?other:thread).name=m.params.name;}if(m.method==='thread/resume'&&rejectResume){ws.send(JSON.stringify({id:m.id,error:{code:-32602,message:'Fixture resume failed'}}));return;}if(m.method==='turn/start'&&rejectTurn){ws.send(JSON.stringify({id:m.id,error:{code:-32602,message:'Fixture mode unavailable'}}));return;}if(m.method&&m.id!==undefined){let result={};if(m.method==='thread/list')result={data:listRows.map(t=>({...t,updatedAt:1})),nextCursor:listCursor};if(m.method==='model/list')result={data:[]};if(['thread/read','thread/resume','thread/start'].includes(m.method))result={thread:m.params?.threadId==='other-task'?other:thread,model:'fixture-model',reasoningEffort:'high'};if(m.method==='thread/start'){created={id:'created-task',preview:'',cwd:'/tmp',turns:[]};listRows.push(created);result={thread:created,model:'fixture-model',reasoningEffort:'high'};}if(m.method==='thread/read'&&m.params.threadId===created?.id)result={thread:created};if(m.method==='turn/start'){if(m.params.threadId===created?.id)created.preview=m.params.input[0].text;result={turn:{id:'new-turn',status:'inProgress'}};}ws.send(JSON.stringify({id:m.id,result}));}})});
 const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 await writeFile(join(dir,'config.json'),JSON.stringify({bind:['127.0.0.1'],port,socket}));
 await writeFile(join(dir,'users.json'),JSON.stringify({version:1,users:await Promise.all(['admin','user'].map(role=>hashUser({username:role,password:'browser-fixture',role})))}));
 bridge=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,DOOM_CONFIG:join(dir,'config.json'),DOOM_STATE_DIR:dir},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break}catch{}await sleep(50);}
 chrome=spawn('/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-extensions','--no-first-run','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',`--user-data-dir=${dir}/browser`,'about:blank'],{stdio:'ignore'});
 let debugPort;for(let i=0;i<100;i++){try{debugPort=(await readFile(join(dir,'browser/DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{}await sleep(100)}
 console.log('Browser debugging port ready');
 const targets=await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();const page=targets.find(t=>t.type==='page');cdp=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>cdp.once('open',r));
 let id=0;const pending=new Map(),errors=[];cdp.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout: '+method));},60000);pending.set(n,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});cdp.send(JSON.stringify({id:n,method,params}));});
 const js=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<100;i++){if(await js(expression))return;await sleep(100)}throw Error('Timeout: '+expression+' state='+JSON.stringify(await js('({url:location.href,error:document.querySelector("#login-error")?.textContent,notice:document.querySelector("#notice")?.textContent,connection:document.querySelector("#connection")?.textContent})')));};
 console.log('Browser CDP connected');
 await call('Runtime.enable');await call('Page.enable');await call('Page.navigate',{url:`http://127.0.0.1:${port}`});await wait('typeof document.querySelector("#login-form")?.onsubmit==="function"');await sleep(300);
 const login=async role=>{await js(`document.querySelector('#username').value=${JSON.stringify(role)};document.querySelector('#password').value='browser-fixture';document.querySelector('#login-form').requestSubmit()`);await wait('!document.querySelector("#workspace").hidden && !!document.querySelector("#tasks button")');};

 const evidence=root+'docs/ui-evidence/task-list/';await mkdir(evidence,{recursive:true});
 const capture=async (state,prepare=async()=>{})=>{
  for(const [label,width,height]of [['desktop',1440,900],['mobile',390,844]]){
   await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:label==='mobile'});
   await js('document.fonts.ready');
   await prepare();
   assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true,'no horizontal overflow');
   const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile(evidence+label+'-'+state+'.png',Buffer.from(shot.data,'base64'));
  }
 };
 const names=()=>js('Array.from(document.querySelectorAll("#tasks button"),b=>b.firstChild.textContent)');
 const draft=()=>js('document.querySelector("#prompt").value');
 const refresh=async()=>{await js('document.querySelector("#refresh").click()');await wait('!document.querySelector("#task-list-status").textContent.includes("Loading")')};
 console.log('Browser page ready');
 await login('admin');
 assert.deepEqual(await names(),['Browser fixture','Review diagnostic test ordinary']);
 await js('document.querySelector("#tasks button").click()');await wait('document.querySelector("#conversation").textContent.includes("Fixture task content")');
 await js('document.querySelector("#prompt").value="Keep my unsent draft"');
 await capture('tasks');
 // Review correction 001: a pending replacement cannot be cancelled by Load more.
 const releaseList=(data,nextCursor=null)=>{holdList=false;for(const[ws,id]of held.splice(0))ws.send(JSON.stringify({id,result:{data:data.map(t=>({...t,updatedAt:1})),nextCursor}}));};
 const waitHeld=async()=>{for(let i=0;i<100;i++){if(held.length)return;await sleep(20)}throw Error('Expected held list request')};
 listCursor='old-page';await refresh();holdList=true;
 await js('document.querySelector("#refresh").click()');await waitHeld();
 const beforePagination=requests.filter(m=>m.method==='thread/list').length;
 assert.equal(await js('document.querySelector("#more").disabled'),true);
 await js('document.querySelector("#more").click()');
 await capture('pagination-loading');
 assert.equal(requests.filter(m=>m.method==='thread/list').length,beforePagination,'disabled pagination sends no request');
 const fresh={...thread,id:'fresh-task',preview:'Fresh user task'};
 releaseList([fresh,...internal],'fresh-page');await wait('!!document.querySelector("[data-id=fresh-task]")');
 assert.deepEqual(await names(),['Fresh user task']);
 listRows=[thread];listCursor=null;await js('document.querySelector("#more").click()');
 await wait('document.querySelectorAll("#tasks button").length===2');
 assert.equal(requests.findLast(m=>m.method==='thread/list').params.cursor,'fresh-page');
 assert.deepEqual(await names(),['Fresh user task','Browser fixture']);
 listRows=[thread,other,...internal];await refresh();
 // Review correction 002: actual keyboard menus and streamed refreshes at both sizes.
 const key=async(key,code,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await call('Input.dispatchKeyEvent',{type,key,windowsVirtualKeyCode:code,modifiers});};
 const focusTask=async()=>{await js('document.querySelector("#tasks button").focus()');await key('Shift',16,8);await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');};
 const openKeyboardMenu=async()=>{await focusTask();await key('F10',121,8);await wait('!document.querySelector("#task-context-menu").hidden');};
 const internalStart=()=>upstream.send(JSON.stringify({method:'thread/started',params:{thread:internal[0]}}));
 await capture('keyboard-menu',openKeyboardMenu);
 await capture('focus-restored',async()=>{
  for(const menu of [false,true]){
   if(menu)await openKeyboardMenu();else await focusTask();
   holdList=true;internalStart();await waitHeld();releaseList(listRows);
   await wait('!document.querySelector("#task-list-status").textContent.includes("Loading")');
   assert.equal(await js('document.activeElement.dataset.id'),'fixture-task');
   assert.equal(await js('document.querySelector("#task-context-menu").hidden'),true);
   assert.equal(await js('document.activeElement.matches(":focus-visible")'),true);
  }
 });
 await capture('focus-fallback',async()=>{
  listRows=[thread,other,...internal];await refresh();await openKeyboardMenu();
  holdList=true;internalStart();await waitHeld();releaseList([other,...internal]);
  await wait('document.querySelectorAll("#tasks button").length===1');
  assert.equal(await js('document.activeElement.dataset.id'),'other-task');
 });
 for(const menu of [false,true]){
  listRows=[thread,other,...internal];await refresh();
  if(menu)await openKeyboardMenu();else await focusTask();
  holdList=true;internalStart();await waitHeld();await js('document.querySelector("#prompt").focus()');releaseList(listRows);
  await wait('!document.querySelector("#task-list-status").textContent.includes("Loading")');
  assert.equal(await js('document.activeElement.id'),'prompt');
 }
 assert.equal(await draft(),'Keep my unsent draft');
 assert.match(await js('document.querySelector("#conversation").textContent'),/Fixture task content/);

 const streamed={...thread,id:'streamed',name:'A long custom user title stays intact',source:'appServer'};listRows.push(streamed);
 upstream.send(JSON.stringify({method:'thread/started',params:{thread:streamed}}));
 await wait('document.querySelectorAll("#tasks button").length===3');assert.ok((await names()).includes(streamed.name));
 listRows=listRows.filter(t=>t!==streamed);await refresh();
 await js('document.querySelectorAll("#tasks button")[1].click()');await wait('document.querySelector("#task-title").textContent==="Review diagnostic test ordinary"');
 assert.equal(await draft(),'Keep my unsent draft');
 await js(`document.querySelectorAll('#tasks button')[1].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:160}));document.querySelector('#context-archive').click()`);
 await wait('document.querySelector("#archive-dialog").open');assert.equal(await js('document.querySelector("#archive-name").textContent'),'Review diagnostic test ordinary');await capture('archive');
 await js('document.querySelector("#archive-cancel").click()');
 await js('document.querySelector("#rename-task").click()');await capture('rename');
 const custom='My custom name with more than four words';
 await js(`document.querySelector('#task-name').value=${JSON.stringify(custom)};document.querySelector('#rename-form').requestSubmit()`);
 await wait('!document.querySelector("#rename-dialog").open');await refresh();
 assert.ok((await names()).includes(custom));assert.equal(await draft(),'Keep my unsent draft');
 // A selected task becomes reliably internal: keep the conversation and draft.
 other.originator='prime_mover';
 upstream.send(JSON.stringify({method:'thread/started',params:{thread:internal[0]}}));
 await wait('document.querySelectorAll("#tasks button").length===1');
 assert.equal(await js('document.querySelector("#task-title").textContent'),custom);
 assert.match(await js('document.querySelector("#conversation").textContent'),/Fixture task content/);
 assert.equal(await draft(),'Keep my unsent draft');
 // Existing pending-request navigation still opens filtered history.
 upstream.send(JSON.stringify({id:1001,method:'item/tool/requestUserInput',params:{threadId:'other-task',questions:[{id:'q',question:'Synthetic fixture question'}]}}));
 await js('document.querySelector("#tasks button").click()');await wait('document.querySelector("#approvals button")?.textContent==="Open requesting task"');
 await js('document.querySelector("#approvals button").click()');await wait(`document.querySelector('#task-title').textContent===${JSON.stringify(custom)}`);
 assert.equal(await draft(),'Keep my unsent draft');
 upstream.send(JSON.stringify({method:'serverRequest/resolved',params:{requestId:1001}}));
 await wait('!document.querySelector("#approvals button")');
 await capture('selected-filtered');
 listRows=internal;await refresh();await wait('document.querySelector("#task-list-status").textContent==="No tasks yet."');await capture('empty');
 holdList=true;await js('document.querySelector("#refresh").click()');await wait('document.querySelector("#task-list-status").textContent==="Loading tasks…"');await capture('loading');
 holdList=false;for(const[ws,id]of held)ws.send(JSON.stringify({id,result:{data:[],nextCursor:null}}));
 await wait('document.querySelector("#task-list-status").textContent==="No tasks yet."');
 rejectList=true;await refresh();await wait('document.querySelector("#task-list-status").textContent.includes("Try Refresh")');await capture('error');
 rejectList=false;listRows=[thread];await refresh();assert.deepEqual(await names(),['Browser fixture']);assert.equal(await draft(),'Keep my unsent draft');
 await js('document.querySelector("#new-task").click()');assert.equal(await draft(),'Keep my unsent draft');
 await js('document.querySelector("#prompt").value="Build a useful fixture task today"');
 await js('document.querySelector("#composer").requestSubmit()');await wait('document.querySelector("#prompt").value===""');
 await wait('Array.from(document.querySelectorAll("#tasks button"),b=>b.firstChild.textContent).includes("Build a useful fixture")');
 upstream.send(JSON.stringify({method:'turn/completed',params:{threadId:created.id,turn:{id:'new-turn',status:'completed'}}}));
 await wait('document.querySelector("#task-title").textContent==="Build a useful fixture"');
 assert.ok(requests.some(m=>m.method==='thread/start'));assert.ok(requests.some(m=>m.method==='turn/start'));
 await capture('created');
 assert.deepEqual(errors,[]);console.log('PASS task-list Chromium: provenance, four-word fallbacks, custom rename, refresh/SSE, selected filtered history, approval navigation, draft preservation, create, loading/empty/error/retry, desktop/mobile screenshots.');
}finally{
 cdp?.close();chrome?.kill();bridge?.kill();for(const ws of wss?.clients||[])ws.terminate();wss?.close();daemon?.close();await sleep(500);await rm(dir,{recursive:true,force:true});
}
