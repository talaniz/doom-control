import http from 'node:http';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadUsers,authenticate} from './auth.mjs';
import {UploadStore} from './uploads.mjs';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import WebSocket from 'ws';
const root=fileURLToPath(new URL('.',import.meta.url));
const config=JSON.parse(readFileSync(process.env.DOOM_CONFIG || root+'config.json'));
const state=process.env.DOOM_STATE_DIR || root+'.private/';
const users=loadUsers(join(state,'users.json'));
const uploads=new UploadStore(state);
const sessions=new Map(), streams=new Set(), pending=new Map(), approvals=new Map();
let upstream,ready=false,nextId=1,retry;
const allowed=new Set(['thread/list','thread/read','thread/start','thread/resume','turn/start','turn/interrupt','model/list']);
const readMethods=new Set(['thread/list','thread/read','model/list']);
function broadcast(m){const s='data: '+JSON.stringify(m)+'\n\n';for(const r of streams){const session=sessions.get(r.session);if(!session||session.until<=Date.now()){r.end();streams.delete(r)}else if(!r.write(s))r.destroy();}}
function send(m){if(upstream?.readyState!==WebSocket.OPEN)throw Error('App server is disconnected');upstream.send(JSON.stringify(m));}
function rpc(method,params={}){return new Promise((resolve,reject)=>{const id=nextId++;const timer=setTimeout(()=>{pending.delete(id);reject(Error('App server request timed out'))},60000);pending.set(id,{resolve,reject,timer});try{send({id,method,params})}catch(e){clearTimeout(timer);pending.delete(id);reject(e)}});}
function connect(){
 upstream=new WebSocket('ws+unix://'+config.socket+':/',{headers:{Host:'localhost'},perMessageDeflate:false,handshakeTimeout:5000,maxPayload:128*1024*1024});
 upstream.on('open',async()=>{try{await rpc('initialize',{clientInfo:{name:'doom_control_room',title:'DOOM Control Room',version:'1.0.0'},capabilities:{experimentalApi:true}});send({method:'initialized'});ready=true;broadcast({method:'bridge/status',params:{ready}})}catch{upstream.close()}});
 upstream.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}
  if(m.method){
   if(m.id!==undefined){
    if(['item/commandExecution/requestApproval','item/fileChange/requestApproval','item/tool/requestUserInput'].includes(m.method))approvals.set(String(m.id),m);
    else {send({id:m.id,error:{code:-32601,message:'This browser client cannot handle '+m.method+'. Use the desktop client for this action.'}});broadcast({method:'bridge/unsupported',params:{method:m.method,threadId:m.params?.threadId}});return;}
   }
   if(m.method==='serverRequest/resolved')approvals.delete(String(m.params.requestId));
   broadcast(m);
  }else if(pending.has(m.id)){const p=pending.get(m.id);clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}
 });
 upstream.on('error',()=>{});
 upstream.on('close',()=>{ready=false;approvals.clear();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('App server disconnected'))}pending.clear();broadcast({method:'bridge/status',params:{ready}});retry=setTimeout(connect,3000)});
}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}
function auth(req){const id=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('doom_session='))?.slice(13);const s=sessions.get(id);if(s&&s.until>Date.now())return {id,...s};return null;}
async function body(req){let s='';for await(const b of req){s+=b;if(s.length>1024*1024)throw Error('Request too large')}return JSON.parse(s||'{}');}
const failures=new Map();
async function handle(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 const hosts=config.bind.map(ip=>ip+':'+config.port);
 if(!hosts.includes(req.headers.host))return json(res,403,{error:'Unrecognized host'});
 if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)return json(res,403,{error:'Cross-origin request blocked'});
 if(req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'Cross-site request blocked'});
 const path=new URL(req.url,'http://localhost').pathname;
 try{
  if(req.method==='POST'&&path==='/api/login'){
   const ip=req.socket.remoteAddress;let f=failures.get(ip);if(f&&f.until<Date.now()){failures.delete(ip);f=null}if(f?.count>=10)return json(res,429,{error:'Too many attempts. Try again in 10 minutes.'});
   // Reserve an attempt before password hashing so concurrent failures cannot bypass the limit.
   failures.set(ip,{count:(f?.count||0)+1,until:f?.until||Date.now()+600000});
   const b=await body(req);const user=await authenticate(users,b.username,b.password);
   if(!user)return json(res,401,{error:'Username or password not recognized'});
   failures.delete(ip);
   const previous=auth(req);if(previous){sessions.delete(previous.id);for(const r of streams)if(r.session===previous.id)r.end();}
   const id=randomBytes(32).toString('hex');sessions.set(id,{until:Date.now()+12*3600000,user});res.setHeader('Set-Cookie',`doom_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);return json(res,200,{ok:true,user});
  }
  if(path.startsWith('/api/')){
   const session=auth(req);if(!session)return json(res,401,{error:'Sign in to continue'});
   if(path==='/api/uploads'||path.startsWith('/api/uploads/')){
    if(session.user.role!=='admin')return json(res,403,{error:'Read-only account: administrator permission required'});
    if(req.method==='POST'&&path==='/api/uploads')return json(res,201,await uploads.save(req,session.user.username));
    if(req.method==='DELETE'&&/^\/api\/uploads\/[a-f0-9]{32}$/.test(path)){await uploads.remove(path.split('/').at(-1),session.user.username);return json(res,200,{ok:true});}
    return json(res,404,{error:'Not found'});
   }
   if(req.method==='GET'&&path==='/api/status')return json(res,200,{ready,user:session.user,pending:[...approvals.values()]});
   if(req.method==='POST'&&path==='/api/logout'){sessions.delete(session.id);for(const r of streams)if(r.session===session.id)r.end();res.setHeader('Set-Cookie','doom_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true})}
   if(req.method==='GET'&&path==='/api/events'){
    res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.session=session.id;res.write('data: '+JSON.stringify({method:'bridge/status',params:{ready,pending:[...approvals.values()]}})+'\n\n');streams.add(res);
    const beat=setInterval(()=>{if(!auth(req))res.end();else res.write(': heartbeat\n\n')},15000);req.on('close',()=>{clearInterval(beat);streams.delete(res)});return;
   }
   if(req.method==='POST'&&path==='/api/rpc'){
    const b=await body(req);if(!allowed.has(b.method))return json(res,403,{error:'Method not supported'});
    if(session.user.role!=='admin'&&!readMethods.has(b.method))return json(res,403,{error:'Read-only account: administrator permission required'});
    if(!ready)return json(res,503,{error:'App server is reconnecting'});
    // Apply the selected mode here too, so already-open browser tabs cannot override it.
    let params=['thread/start','thread/resume','turn/start'].includes(b.method)
     ? {...b.params,approvalPolicy:'on-request',approvalsReviewer:'auto_review'} : b.params;
    if(b.attachments!==undefined){
     if(b.method!=='turn/start')return json(res,400,{error:'Attachments may only be sent with a prompt'});
     if(!Array.isArray(params?.input))return json(res,400,{error:'Prompt input is required'});
     const records=uploads.inputs(b.attachments,session.user.username);
     params={...params,input:[...params.input,...uploads.pin(records)]};
    }
    return json(res,200,await rpc(b.method,params));
   }
   if(req.method==='POST'&&path==='/api/respond'){
    if(session.user.role!=='admin')return json(res,403,{error:'Read-only account: administrator permission required'});
    const b=await body(req),request=approvals.get(String(b.id));if(!request)return json(res,409,{error:'This request has already been resolved'});
    if(request.method.endsWith('requestApproval')&&!['accept','decline','cancel'].includes(b.result?.decision))return json(res,400,{error:'Invalid decision'});
    if(request.method.endsWith('requestUserInput'))for(const q of request.params.questions){if(!Array.isArray(b.result?.answers?.[q.id]?.answers)||!b.result.answers[q.id].answers.every(x=>typeof x==='string'))return json(res,400,{error:'Answer every question'})}
    send({id:request.id,result:b.result});approvals.delete(String(b.id));broadcast({method:'serverRequest/resolved',params:{requestId:request.id}});return json(res,200,{ok:true});
   }
   return json(res,404,{error:'Not found'});
  }
  const assets={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/links.js':['links.js','text/javascript; charset=utf-8'],'/styles.css':['styles.css','text/css; charset=utf-8']};
  if(req.method!=='GET'||!assets[path])return json(res,404,{error:'Not found'});
  const [file,type]=assets[path];res.setHeader('Content-Type',type);res.end(readFileSync(root+'dist/'+file));
 }catch(e){json(res,e.status||400,{error:e.message})}
}
connect();
for(const host of config.bind){const server=http.createServer(handle);server.on('error',e=>{console.error('Listener failed:',host,e.message);process.exit(1)});server.listen(config.port,host,()=>console.log(`DOOM Control Room: http://${host}:${config.port}`));}
setInterval(()=>{for(const [id,s]of sessions)if(s.until<Date.now())sessions.delete(id);for(const [ip,f]of failures)if(f.until<Date.now())failures.delete(ip)},60000).unref();
