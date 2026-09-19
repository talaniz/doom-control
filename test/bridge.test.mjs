import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {once} from 'node:events';
import {WebSocketServer} from 'ws';

test('authenticated bridge preserves RPC, streams approvals, rejects unsafe requests, and reconnects', {timeout:20000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'doom-test-'));
 const unix=join(dir,'app.sock');const daemon=http.createServer();const wss=new WebSocketServer({server:daemon,perMessageDeflate:false});
 await new Promise(r=>daemon.listen(unix,r));
 const portProbe=http.createServer();await new Promise(r=>portProbe.listen(0,'127.0.0.1',r));const port=portProbe.address().port;await new Promise(r=>portProbe.close(r));
 let upstream;const replies=[],requests=[];
 wss.on('connection',ws=>{upstream=ws;ws.on('message',b=>{const m=JSON.parse(b);requests.push(m);if(m.method&&m.id!==undefined)ws.send(JSON.stringify({id:m.id,result:m.method==='thread/list'?{data:[{id:'test-task'}],nextCursor:null}:{}}));else if(m.id!==undefined)replies.push(m)})});
 await writeFile(join(dir,'config.json'),JSON.stringify({bind:['127.0.0.1'],port,socket:unix}));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DOOM_CONFIG:join(dir,'config.json'),DOOM_STATE_DIR:dir+'/'},stdio:'pipe'});
 t.after(async()=>{child.kill();await once(child,'exit');for(const ws of wss.clients)ws.terminate();wss.close();await new Promise(r=>daemon.close(r));await rm(dir,{recursive:true,force:true})});
 const base=`http://127.0.0.1:${port}`;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break}catch{}await sleep(100)}
 assert.equal((await fetch(base+'/api/status')).status,401);
 assert.equal((await fetch(base+'/config.json')).status,404);
 assert.equal((await fetch(base+'/.private/access-key')).status,404);
 assert.equal(await new Promise((resolve,reject)=>{const req=http.get(base,{headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject)}),403);
 const login=key=>fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});
 assert.equal((await login('wrong')).status,401);
 const key=(await readFile(join(dir,'access-key'),'utf8')).trim();const logged=await login(key);assert.equal(logged.status,200);assert.match(logged.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);const cookie=logged.headers.get('set-cookie').split(';')[0];
 const post=(path,data,extra={})=>fetch(base+'/api/'+path,{method:'POST',headers:{cookie,'Content-Type':'application/json',...extra},body:JSON.stringify(data)});
 assert.equal((await post('rpc',{method:'thread/list'},{Origin:'http://evil.example'})).status,403);
 assert.equal((await post('rpc',{method:'config/value/write'})).status,403);
 const listed=await post('rpc',{method:'thread/list'});assert.equal(listed.status,200);assert.deepEqual((await listed.json()).data,[{id:'test-task'}]);
 for(const method of ['thread/start','thread/resume','turn/start']){
  const response=await post('rpc',{method,params:{threadId:'test-task',approvalPolicy:'never',approvalsReviewer:'user'}});
  assert.equal(response.status,200);
  const forwarded=requests.findLast(r=>r.method===method);
  assert.equal(forwarded.params.approvalPolicy,'on-request');
  assert.equal(forwarded.params.approvalsReviewer,'auto_review');
  assert.equal(forwarded.params.threadId,'test-task');
 }
 const controller=new AbortController();const events=await fetch(base+'/api/events',{headers:{cookie},signal:controller.signal});const reader=events.body.getReader();let received='';
 const readUntil=async text=>{while(!received.includes(text)){const result=await reader.read();if(result.done)throw Error('Stream closed');received+=new TextDecoder().decode(result.value)}};
 await readUntil('bridge/status');
 upstream.send(JSON.stringify({id:501,method:'item/commandExecution/requestApproval',params:{threadId:'test-task',turnId:'turn',itemId:'item',command:'echo hello'}}));
 await readUntil('requestApproval');assert.equal(replies.length,0,'never automatically approves');
 assert.equal((await post('respond',{id:501,result:{decision:'acceptForSession'}})).status,400);
 assert.equal((await post('respond',{id:501,result:{decision:'decline'}})).status,200);
 await sleep(20);assert.deepEqual(replies.at(-1),{id:501,result:{decision:'decline'}});
 assert.equal((await post('respond',{id:501,result:{decision:'accept'}})).status,409);
 upstream.send(JSON.stringify({id:502,method:'item/tool/requestUserInput',params:{threadId:'test-task',questions:[{id:'answer',question:'Which?'}]}}));
 await readUntil('requestUserInput');assert.equal((await post('respond',{id:502,result:{answers:{}}})).status,400);
 assert.equal((await post('respond',{id:502,result:{answers:{answer:{answers:['first']}}}})).status,200);
 upstream.send(JSON.stringify({id:503,method:'unknown/action',params:{threadId:'test-task'}}));await readUntil('bridge/unsupported');await sleep(20);assert.equal(replies.at(-1).error.code,-32601);
 upstream.close();await readUntil('"ready":false');await sleep(3300);const status=await (await fetch(base+'/api/status',{headers:{cookie}})).json();assert.equal(status.ready,true);
 controller.abort();await post('logout',{});assert.equal((await fetch(base+'/api/status',{headers:{cookie}})).status,401);
 for(let i=0;i<10;i++)await login('bad');assert.equal((await login(key)).status,429);
});
