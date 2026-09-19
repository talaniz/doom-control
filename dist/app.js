const $=s=>document.querySelector(s);
let thread=null,turn=null,stream=null,connected=false,cursor=null,selection=0,starting=false,loadingTask=false,permissionLabel='Workspace edits · Approve for me';
const requests=new Map(),items=new Map();
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
function notice(text){$('#notice').hidden=!text;$('#notice').textContent=text||''}
async function api(path,data){const r=await fetch('/api/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});const b=await r.json();if(!r.ok){if(r.status===401)lock();throw Error(b.error||'Request failed')}return b}
const rpc=(method,params={})=>api('rpc',{method,params});
function controls(){ $('#send').disabled=!connected||!!turn||starting||loadingTask;$('#new-task').disabled=starting;$('#stop').disabled=loadingTask;$('#stop').hidden=!turn;$('#new-settings').hidden=!!thread;$('#run-status').textContent=turn?'Codex is working…':permissionLabel;$('#connection').textContent=connected?'App server connected':'Reconnecting…'; }
function lock(){stream?.close();stream=null;$('#login').hidden=false;$('#workspace').hidden=true;connected=false;requests.clear();$('#approvals').replaceChildren();controls()}
async function list(more=false){const b=await rpc('thread/list',{limit:30,sortKey:'updated_at',...(more&&cursor?{cursor}:{})});if(!more)$('#tasks').replaceChildren();cursor=b.nextCursor;$('#more').hidden=!cursor;for(const t of b.data){const btn=el('button',(t.name||t.preview||'Untitled task').slice(0,100));btn.dataset.id=t.id;btn.classList.toggle('selected',thread?.id===t.id);btn.append(el('small',new Date(t.updatedAt*1000).toLocaleDateString()));btn.onclick=()=>openTask(t.id).catch(e=>notice(e.message));$('#tasks').append(btn)}}
function title(){ $('#task-title').textContent=thread?.name||thread?.preview?.slice(0,90)||'Your next move.';$('#task-meta').textContent=thread?thread.cwd:'Choose a task or start something new.';for(const b of $('#tasks').children)b.classList.toggle('selected',b.dataset.id===thread?.id);controls() }
function itemText(i){if(i.type==='userMessage')return i.content.map(c=>c.text||`[${c.type}]`).join('\n');if(i.text!==undefined)return i.text;if(i.type==='commandExecution')return i.command+'\n\n'+(i.aggregatedOutput||'');if(i.type==='fileChange')return i.changes.map(c=>c.path+'\n'+(c.diff||'')).join('\n');if(i.type==='reasoning')return (i.summary||[]).join('\n');return JSON.stringify(i,null,2)}
function renderItem(i){if(!i?.id)return;if(i.type==='reasoning'&&!itemText(i))return;let row=items.get(i.id);if(!row){row=el('article',undefined,'message '+(i.type==='userMessage'?'user':i.type==='agentMessage'?'agent':'tool'));items.set(i.id,row);$('#conversation .empty')?.remove();$('#conversation').append(row)}const nearBottom=$('#conversation').scrollHeight-$('#conversation').scrollTop-$('#conversation').clientHeight<160;row.replaceChildren();const label=i.type==='userMessage'?'You':i.type==='agentMessage'?'Codex':i.type.replace(/([A-Z])/g,' $1');row.append(el('h3',label));const pre=el('pre',itemText(i));if(!['userMessage','agentMessage','plan'].includes(i.type)){const d=el('details');d.append(el('summary',i.status||'Details'),pre);row.append(d)}else row.append(pre);if(nearBottom)$('#conversation').scrollTop=$('#conversation').scrollHeight;row.item=i}
function renderThread(t){thread=t;items.clear();$('#conversation').replaceChildren();turn=null;for(const tr of t.turns||[]){for(const i of tr.items||[])renderItem(i);if(tr.status==='inProgress')turn=tr.id;if(tr.error)notice(tr.error.message)}title();drawRequests();$('#conversation').scrollTop=$('#conversation').scrollHeight}
async function openTask(id){
 if(starting)throw Error('Wait for your prompt to be sent before changing tasks.');
 const serial=++selection;loadingTask=true;controls();notice('');
 try{
  const b=await rpc('thread/resume',{threadId:id,approvalPolicy:'on-request',approvalsReviewer:'auto_review'});
  if(serial!==selection)return;
  permissionLabel='Permissions: '+(b.sandbox?.type||'server policy')+' · Approve for me';
  renderThread(b.thread);
 }finally{if(serial===selection){loadingTask=false;controls()}}
}
function newTask(){if(starting)return;loadingTask=false;permissionLabel='Workspace edits · Approve for me';selection++;thread=null;turn=null;items.clear();$('#conversation').replaceChildren(el('div','Start a task with your first prompt.','empty'));title();drawRequests();$('#prompt').focus()}
async function sendPrompt(text){if(!connected||loadingTask)throw Error('Wait for the selected task to connect.');if(!text.trim())throw Error('Enter a prompt');if(turn||starting)throw Error('Wait for this turn to finish or stop it first');starting=true;controls();notice('');try{if(!thread){const b=await rpc('thread/start',{cwd:$('#cwd').value,approvalPolicy:'on-request',approvalsReviewer:'auto_review',sandbox:'workspace-write',...($('#model').value?{model:$('#model').value}:{})});renderThread(b.thread)}const b=await rpc('turn/start',{threadId:thread.id,input:[{type:'text',text}],approvalPolicy:'on-request',approvalsReviewer:'auto_review'});turn=b.turn.status==='inProgress'?b.turn.id:null;$('#prompt').value='';await list();return{threadId:thread.id,turnId:b.turn.id}}finally{starting=false;controls()}}
function drawRequests(){const panel=$('#approvals');panel.replaceChildren();for(const r of requests.values()){const p=r.params;const box=el('div',undefined,'approval');box.append(el('h3',r.method.endsWith('requestUserInput')?'Codex has a question':'Your approval is needed'));if(p.threadId!==thread?.id){const open=el('button','Open requesting task');open.onclick=()=>openTask(p.threadId).catch(e=>notice(e.message));box.append(open)}
 const respond=async result=>{try{await api('respond',{id:r.id,result});requests.delete(String(r.id));drawRequests()}catch(e){notice(e.message)}};
 if(r.method.endsWith('requestUserInput')){const inputs=[];for(const q of p.questions){const label=el('label',q.question);if(q.options?.length)label.append(el('p',q.options.map(o=>o.label+': '+o.description).join('\n')));const input=el('input');input.type=q.isSecret?'password':'text';label.append(input);box.append(label);inputs.push([q.id,input])}const btn=el('button','Send answers','primary');btn.onclick=()=>{if(inputs.some(([,i])=>!i.value.trim()))return notice('Answer every question before sending.');respond({answers:Object.fromEntries(inputs.map(([id,i])=>[id,{answers:[i.value]}]))})};box.append(btn)}else{box.append(el('p',p.reason||'Review this action before it runs.'));box.append(el('pre',p.command||JSON.stringify(p,null,2)));if(p.cwd)box.append(el('p','Directory: '+p.cwd));for(const [text,decision]of [['Approve once','accept'],['Deny','decline']]){const btn=el('button',text,decision==='accept'?'primary':'quiet');btn.onclick=()=>respond({decision});box.append(btn)}}panel.append(box)}}
function onEvent(m){const p=m.params||{};if(m.method==='bridge/status'){const was=connected;connected=p.ready;if(p.pending){requests.clear();for(const r of p.pending)requests.set(String(r.id),r);drawRequests()}controls();if(connected&&!was){loadModels().catch(e=>notice(e.message));list().catch(e=>notice(e.message));if(thread)openTask(thread.id).catch(e=>notice(e.message))}return}if(m.id!==undefined){requests.set(String(m.id),m);drawRequests();return}if(m.method==='serverRequest/resolved'){requests.delete(String(p.requestId));drawRequests();return}if(m.method==='bridge/unsupported'){notice('This action needs the desktop client: '+p.method);return}if(!thread||p.threadId!==thread.id)return;
 if(m.method==='turn/started'){turn=p.turn.id;controls()}
 if(m.method==='item/started'||m.method==='item/completed')renderItem(p.item);
 if(m.method==='item/agentMessage/delta'){const old=items.get(p.itemId)?.item||{id:p.itemId,type:'agentMessage',text:''};renderItem({...old,text:old.text+p.delta})}
 if(m.method==='item/commandExecution/outputDelta'){const old=items.get(p.itemId)?.item;if(old)renderItem({...old,aggregatedOutput:(old.aggregatedOutput||'')+p.delta})}
 if(m.method==='turn/completed'){turn=null;controls();if(p.turn.error)notice(p.turn.error.message);rpc('thread/read',{threadId:thread.id,includeTurns:true}).then(b=>{if(b.thread.id===thread?.id)renderThread(b.thread)}).catch(e=>notice(e.message));list().catch(()=>{})}
 if(m.method==='error')notice(p.error?.message||'The app server reported an error');
}
async function loadModels(){
 const selected=$('#model').value;
 const b=await rpc('model/list');
 $('#model').replaceChildren(el('option','Server default'));
 $('#model').firstChild.value='';
 for(const m of b.data){const o=el('option',m.displayName||m.model);o.value=m.model;$('#model').append(o)}
 if([...$('#model').options].some(o=>o.value===selected))$('#model').value=selected;
}
async function enter(){
 const status=await api('status');
 $('#login').hidden=true;$('#workspace').hidden=false;connected=status.ready;
 for(const r of status.pending)requests.set(String(r.id),r);
 drawRequests();controls();stream?.close();stream=new EventSource('/api/events');
 stream.onmessage=e=>onEvent(JSON.parse(e.data));
 stream.onerror=()=>{connected=false;controls();api('status').catch(()=>{})};
 if(connected)await Promise.all([list(),loadModels()]);
}
$('#login-form').onsubmit=async e=>{e.preventDefault();try{await api('login',{key:$('#access-key').value});$('#access-key').value='';$('#login-error').textContent='';await enter()}catch(e){$('#login-error').textContent=e.message}};
$('#composer').onsubmit=e=>{e.preventDefault();sendPrompt($('#prompt').value).catch(e=>notice(e.message))};
$('#prompt').onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();$('#composer').requestSubmit()}};
$('#new-task').onclick=newTask;$('#refresh').onclick=()=>list().catch(e=>notice(e.message));$('#more').onclick=()=>list(true).catch(e=>notice(e.message));$('#stop').onclick=()=>rpc('turn/interrupt',{threadId:thread.id,turnId:turn}).catch(e=>notice(e.message));$('#logout').onclick=async()=>{await api('logout',{});lock();thread=null;items.clear();$('#conversation').replaceChildren();$('#tasks').replaceChildren();$('#prompt').value=''};
const context=document.modelContext;if(context?.registerTool){const lifetime=new AbortController();addEventListener('pagehide',()=>lifetime.abort(),{once:true});try{Promise.resolve(context.registerTool({name:'open_codex_task',description:'Open an existing Codex task in the control room without sending a prompt.',inputSchema:{type:'object',properties:{taskId:{type:'string'}},required:['taskId'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async input=>{if(typeof input?.taskId!=='string'||!input.taskId)throw Error('taskId is required');await openTask(input.taskId);return{taskId:thread.id,title:thread.name}}},{signal:lifetime.signal})).catch(()=>{})}catch{}}
enter().catch(e=>{if($('#login').hidden)notice(e.message)});
