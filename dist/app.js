import {renderLinkedText} from './links.js';
import {createPromptPicker} from './picker.js';
const $=s=>document.querySelector(s);
let thread=null,turn=null,stream=null,connected=false,cursor=null,selection=0,starting=false,loadingTask=false,permissionLabel='Workspace edits · Approve for me';
let taskSettings=null,renameId=null,renameSaving=false,renameEpoch=0,renameTrigger=null,contextTarget=null;
let archiveId=null,archiveSaving=false,archiveEpoch=0,archiveTrigger=null,loadingId=null;
const archivedIds=new Set();
let currentUser=null,authEpoch=0,attachments=[],uploading=false,attachmentEpoch=0;
const canWrite=()=>currentUser?.role==='admin';
const requests=new Map(),items=new Map();
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
function notice(text){$('#notice').hidden=!text;$('#notice').textContent=text||''}
async function api(path,data){const epoch=authEpoch;const r=await fetch('/api/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});const b=await r.json();if(epoch!==authEpoch)throw Error('Session changed. Sign in again.');if(!r.ok){if(r.status===401)lock();throw Error(b.error||'Request failed')}return b}
const rpc=(method,params={},files=[])=>api('rpc',{method,params,...(files.length?{attachments:files}:{})});
function attachmentText(text){
 if(text?.startsWith('User attached a local file.')){try{const file=JSON.parse(text.split('\n').at(-1));if(typeof file.name==='string'&&typeof file.path==='string')return 'Attached file: '+file.name;}catch{}}
 return text;
}
function drawAttachments(){
 const list=$('#attachments');list.replaceChildren();
 for(const file of attachments){const row=el('li');row.append(el('span',file.name+' · '+Math.max(1,Math.ceil(file.size/1024))+' KiB'+(!file.id?' · Uploading…':'')));
  const remove=el('button','Remove','quiet');remove.type='button';remove.disabled=uploading||starting||file.removing;remove.setAttribute('aria-label','Remove '+file.name);
  remove.onclick=async()=>{if(starting||uploading||file.removing)return;const epoch=attachmentEpoch;file.removing=true;drawAttachments();controls();try{const r=await fetch('/api/uploads/'+file.id,{method:'DELETE'});if(!r.ok&&r.status!==409)throw Error('Could not remove file. Try again.');if(epoch!==attachmentEpoch)return;attachments=attachments.filter(a=>a!==file);drawAttachments();controls();}catch(e){notice(e.message)}finally{if(epoch===attachmentEpoch){file.removing=false;drawAttachments();controls();}}};
  row.append(remove);list.append(row);
 }
}
function resetAttachments(discard=true){
 const previous=attachments;attachments=[];uploading=false;attachmentEpoch++;$('#file-input').value='';drawAttachments();
 if(discard)for(const file of previous)if(file.id)fetch('/api/uploads/'+file.id,{method:'DELETE'}).catch(()=>{});
}
async function attachFiles(files){
 if(!canWrite()||starting||uploading||loadingTask)return;
 const selected=Array.from(files);if(!selected.length)return;
 if(selected.length+attachments.length>5)return notice('Attach up to five files per prompt.');
 if(selected.some(f=>f.size>10*1024*1024))return notice('Each file must be 10 MiB or smaller.');
 const epoch=attachmentEpoch;uploading=true;notice('');controls();
 try{for(const file of selected){
  if(epoch!==attachmentEpoch)break;
  const entry={name:file.name,size:file.size};attachments.push(entry);drawAttachments();
  try{
   const response=await fetch('/api/uploads',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:file});
   const data=await response.json();
   if(epoch!==attachmentEpoch){if(response.ok)fetch('/api/uploads/'+data.id,{method:'DELETE'}).catch(()=>{});break;}
   if(!response.ok){if(response.status===401)lock();throw Error(data.error||'Upload failed');}
   Object.assign(entry,data);
  }catch(error){if(epoch===attachmentEpoch){attachments=attachments.filter(a=>a!==entry);notice(error.message);}break;}
 }}finally{if(epoch===attachmentEpoch){uploading=false;$('#file-input').value='';drawAttachments();controls();}}
}
function controls(){ $('#archive-confirm').disabled=archiveSaving||!connected;$('#archive-confirm').textContent=archiveSaving?'Archiving…':'Archive';$('#archive-cancel').disabled=archiveSaving;if(!canWrite()||!connected||loadingTask||starting)closeTaskMenu();picker.update();$('#rename-task').hidden=!canWrite()||!thread;$('#rename-task').disabled=!connected||loadingTask||starting||renameSaving;$('#rename-save').disabled=renameSaving||!connected;$('#rename-save').textContent=renameSaving?'Saving…':'Save name';$('#rename-cancel').disabled=renameSaving;$('#task-name').disabled=renameSaving; $('#mode').disabled=!connected||!!turn||starting||loadingTask;$('#mode-help').textContent=$('#mode').value==='plan'?'Plan the approach before implementation. Applies to your next prompt.':'Work on the task. Applies to your next prompt.'; $('#composer').hidden=!canWrite();$('#new-task').hidden=!canWrite();$('#read-only').hidden=canWrite();$('#identity').textContent=currentUser?`${currentUser.username} · ${canWrite()?'Admin':'Read-only'}`:''; $('#send').disabled=!connected||!!turn||starting||loadingTask||uploading||attachments.some(a=>a.removing);$('#attach').disabled=starting||uploading||loadingTask||attachments.length>=5;$('#new-task').disabled=starting;$('#stop').disabled=loadingTask;$('#stop').hidden=!canWrite()||!turn;$('#new-settings').hidden=!!thread;$('#run-status').textContent=turn?'Codex is working…':permissionLabel;$('#connection').textContent=connected?'App server connected':'Reconnecting…'; }
function lock(){closeArchive();archivedIds.clear();loadingId=null;closeTaskMenu();closeRename();authEpoch++;resetAttachments();selection++;currentUser=null;taskSettings=null;$('#mode').value='default';thread=null;turn=null;starting=false;loadingTask=false;items.clear();$('#conversation').replaceChildren();$('#tasks').replaceChildren();$('#prompt').value='';notice('');stream?.close();stream=null;$('#login').hidden=false;$('#workspace').hidden=true;connected=false;requests.clear();$('#approvals').replaceChildren();controls()}
async function list(more=false){const b=await rpc('thread/list',{limit:30,sortKey:'updated_at',...(more&&cursor?{cursor}:{})});closeTaskMenu();if(!more)$('#tasks').replaceChildren();cursor=b.nextCursor;$('#more').hidden=!cursor;for(const t of b.data){if(archivedIds.has(t.id))continue;const btn=el('button',(t.name||t.preview||'Untitled task').slice(0,100));btn.taskSummary=t;btn.dataset.id=t.id;if(canWrite())btn.setAttribute('aria-haspopup','menu');btn.oncontextmenu=e=>openTaskMenu(e,btn);btn.onkeydown=e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))openTaskMenu(e,btn);};btn.dataset.preview=(t.preview||'Untitled task').slice(0,100);btn.classList.toggle('selected',thread?.id===t.id);btn.append(el('small',new Date(t.updatedAt*1000).toLocaleDateString()));btn.onclick=()=>openTask(t.id).catch(e=>notice(e.message));$('#tasks').append(btn)}}
function title(){ $('#task-title').textContent=thread?.name||thread?.preview?.slice(0,90)||'Your next move.';$('#task-meta').textContent=thread?thread.cwd:'Choose a task or start something new.';for(const b of $('#tasks').children)b.classList.toggle('selected',b.dataset.id===thread?.id);controls() }
function setTaskName(id,name){
 if(thread?.id===id){thread.name=name;title();}
 for(const button of $('#tasks').children)if(button.dataset.id===id){button.taskSummary.name=name;button.firstChild.textContent=(name||button.dataset.preview||'Untitled task').slice(0,100);}
}
function closeTaskMenu(restoreFocus=false){
 const trigger=contextTarget;contextTarget=null;$('#task-context-menu').hidden=true;
 if(restoreFocus&&trigger?.isConnected)trigger.focus();
}
function openTaskMenu(event,button){
 if(!canWrite()||!connected||loadingTask||starting||renameSaving||archiveSaving)return;
 event.preventDefault();closeTaskMenu();contextTarget=button;
 const menu=$('#task-context-menu'),rect=button.getBoundingClientRect();
 const keyboard=event.type==='keydown';menu.hidden=false;
 menu.style.left=Math.max(0,Math.min(keyboard?rect.left:event.clientX,innerWidth-menu.offsetWidth))+'px';
 menu.style.top=Math.max(0,Math.min(keyboard?rect.bottom:event.clientY,innerHeight-menu.offsetHeight))+'px';
 $('#context-rename').focus();
}
function closeRename(){
 renameEpoch++;renameId=null;renameSaving=false;$('#rename-dialog').close();
 if(renameTrigger?.isConnected)renameTrigger.focus();renameTrigger=null;
}
function openRename(target=thread,trigger=$('#rename-task')){
 if(!canWrite()||!target||!connected||loadingTask||starting||renameSaving||archiveSaving)return;
 closeTaskMenu();renameTrigger=trigger;
 renameEpoch++;renameId=target.id;$('#task-name').value=(target.name||target.preview||'').slice(0,120);$('#rename-error').textContent='';controls();$('#rename-dialog').showModal();$('#task-name').focus();$('#task-name').select();
}
async function saveRename(){
 if(!canWrite()||!renameId||renameSaving)return;
 const name=$('#task-name').value.trim();
 if(!name||name.length>120||/[\u0000-\u001f\u007f]/u.test(name)){$('#rename-error').textContent='Use a name of 1–120 characters without control characters.';return;}
 const id=renameId,serial=renameEpoch;renameSaving=true;$('#rename-error').textContent='';controls();
 try{await rpc('thread/name/set',{threadId:id,name});if(serial!==renameEpoch)return;setTaskName(id,name);closeRename();}
 catch(error){if(serial===renameEpoch)$('#rename-error').textContent=error.message;}
 finally{if(serial===renameEpoch)renameSaving=false;controls();}
}
function closeArchive(){
 archiveEpoch++;archiveId=null;archiveSaving=false;$('#archive-dialog').close();
 const target=archiveTrigger?.isConnected?archiveTrigger:$('#tasks button')||$('#new-task');
 if(!target.hidden)target.focus();archiveTrigger=null;
}
function openArchive(target,trigger){
 if(!canWrite()||!target||!connected||loadingTask||starting||archiveSaving)return;
 closeTaskMenu();archiveId=target.id;archiveTrigger=trigger;archiveEpoch++;
 $('#archive-name').textContent=target.name||target.preview||'Untitled task';$('#archive-error').textContent='';
 controls();$('#archive-dialog').showModal();$('#archive-cancel').focus();
}
function removeArchivedTask(id){
 archivedIds.add(id);
 if(contextTarget?.dataset.id===id)closeTaskMenu();
 if(renameId===id)closeRename();
 for(const button of $('#tasks').children)if(button.dataset.id===id)button.remove();
 for(const [key,r]of requests)if(r.params.threadId===id)requests.delete(key);
 if(loadingId===id){selection++;loadingId=null;loadingTask=false;}
 if(thread?.id===id)resetTask();
 if(archiveId===id&&!archiveSaving)closeArchive();
 drawRequests();controls();
}
async function archiveTask(){
 if(!canWrite()||!archiveId||archiveSaving||!connected)return;
 const id=archiveId,serial=archiveEpoch,epoch=authEpoch;archiveSaving=true;$('#archive-error').textContent='';controls();
 try{
  await rpc('thread/archive',{threadId:id});
  if(serial!==archiveEpoch||epoch!==authEpoch)return;
  removeArchivedTask(id);closeArchive();
 }catch(error){if(serial===archiveEpoch)$('#archive-error').textContent=error.message;}
 finally{if(serial===archiveEpoch)archiveSaving=false;controls();}
}
function itemText(i){if(i.type==='userMessage')return i.content.map(c=>attachmentText(c.text)||(c.type==='skill'?'Skill: '+c.name:c.type==='mention'?'Plugin: '+c.name:`[${c.type}]`)).join('\n');if(i.text!==undefined)return i.text;if(i.type==='commandExecution')return i.command+'\n\n'+(i.aggregatedOutput||'');if(i.type==='fileChange')return i.changes.map(c=>c.path+'\n'+(c.diff||'')).join('\n');if(i.type==='reasoning')return (i.summary||[]).join('\n');return JSON.stringify(i,null,2)}
function renderItem(i){if(!i?.id)return;if(i.type==='reasoning'&&!itemText(i))return;let row=items.get(i.id);if(!row){row=el('article',undefined,'message '+(i.type==='userMessage'?'user':i.type==='agentMessage'?'agent':'tool'));items.set(i.id,row);$('#conversation .empty')?.remove();$('#conversation').append(row)}const nearBottom=$('#conversation').scrollHeight-$('#conversation').scrollTop-$('#conversation').clientHeight<160;row.replaceChildren();const label=i.type==='userMessage'?'You':i.type==='agentMessage'?'Codex':i.type.replace(/([A-Z])/g,' $1');row.append(el('h3',label));const markdown=['userMessage','agentMessage','plan'].includes(i.type);const pre=el(markdown?'div':'pre',undefined,markdown?'markdown':undefined);if(markdown)renderLinkedText(pre,itemText(i));else pre.textContent=itemText(i);if(!['userMessage','agentMessage','plan'].includes(i.type)){const d=el('details');d.append(el('summary',i.status||'Details'),pre);row.append(d)}else row.append(pre);if(nearBottom)$('#conversation').scrollTop=$('#conversation').scrollHeight;row.item=i}
function renderThread(t){thread=t;items.clear();$('#conversation').replaceChildren();turn=null;for(const tr of t.turns||[]){for(const i of tr.items||[])renderItem(i);if(tr.status==='inProgress')turn=tr.id;if(tr.error)notice(tr.error.message)}title();drawRequests();$('#conversation').scrollTop=$('#conversation').scrollHeight}
async function openTask(id){
 if(starting)throw Error('Wait for your prompt to be sent before changing tasks.');
 if(thread?.id!==id)resetAttachments();
 const serial=++selection;loadingId=id;loadingTask=true;controls();notice('');
 try{
  const b=canWrite()?await rpc('thread/resume',{threadId:id,approvalPolicy:'on-request',approvalsReviewer:'auto_review'}):await rpc('thread/read',{threadId:id,includeTurns:true});
  if(serial!==selection)return;
  permissionLabel='Permissions: '+(b.sandbox?.type||'server policy')+' · Approve for me';
  if(thread?.id!==id){picker.reset();$('#mode').value='default';}
  taskSettings={model:b.model,reasoning_effort:b.reasoningEffort??null,developer_instructions:null};
  renderThread(b.thread);
 }finally{if(serial===selection){loadingId=null;loadingTask=false;controls()}}
}
function newTask(){if(!canWrite()||starting)return;resetTask();}
function resetTask(){picker.reset();resetAttachments();taskSettings=null;$('#mode').value='default';loadingTask=false;permissionLabel='Workspace edits · Approve for me';selection++;thread=null;turn=null;items.clear();$('#conversation').replaceChildren(el('div','Start a task with your first prompt.','empty'));title();drawRequests();$('#prompt').focus()}
async function sendPrompt(text){if(!canWrite())throw Error('Read-only account');if(!connected||loadingTask)throw Error('Wait for the selected task to connect.');if(uploading||attachments.some(a=>a.removing))throw Error('Wait for attachment changes to finish');if(!text.trim()&&!attachments.length)throw Error('Enter a prompt or attach a file');if(turn||starting)throw Error('Wait for this turn to finish or stop it first');const selectedInputs=picker.inputs(text);starting=true;controls();notice('');try{if(!thread){const b=await rpc('thread/start',{cwd:$('#cwd').value,approvalPolicy:'on-request',approvalsReviewer:'auto_review',sandbox:'workspace-write',...($('#model').value?{model:$('#model').value}:{})});taskSettings={model:b.model,reasoning_effort:b.reasoningEffort??null,developer_instructions:null};picker.adoptContext(authEpoch+'|'+(b.thread.cwd||$('#cwd').value));renderThread(b.thread)}if(!taskSettings?.model)throw Error('Task settings unavailable. Reopen the task and try again.');const b=await rpc('turn/start',{threadId:thread.id,collaborationMode:{mode:$('#mode').value,settings:taskSettings},input:[{type:'text',text:text.trim()?text:'Please review the attached files.'},...selectedInputs],approvalPolicy:'on-request',approvalsReviewer:'auto_review'},attachments.map(a=>a.id));resetAttachments(false);turn=b.turn.status==='inProgress'?b.turn.id:null;$('#prompt').value='';picker.reset();await list();return{threadId:thread.id,turnId:b.turn.id}}finally{starting=false;controls()}}
function drawRequests(){const panel=$('#approvals');panel.replaceChildren();for(const r of requests.values()){const p=r.params;const box=el('div',undefined,'approval');box.append(el('h3',r.method.endsWith('requestUserInput')?'Codex has a question':'Your approval is needed'));if(p.threadId!==thread?.id){const open=el('button','Open requesting task');open.onclick=()=>openTask(p.threadId).catch(e=>notice(e.message));box.append(open)}
 if(!canWrite()){box.append(el('p','An administrator must respond to this request.'));panel.append(box);continue;}
 const respond=async result=>{try{await api('respond',{id:r.id,result});requests.delete(String(r.id));drawRequests()}catch(e){notice(e.message)}};
 if(r.method.endsWith('requestUserInput')){const inputs=[];for(const q of p.questions){const label=el('label',q.question);if(q.options?.length)label.append(el('p',q.options.map(o=>o.label+': '+o.description).join('\n')));const input=el('input');input.type=q.isSecret?'password':'text';label.append(input);box.append(label);inputs.push([q.id,input])}const btn=el('button','Send answers','primary');btn.onclick=()=>{if(inputs.some(([,i])=>!i.value.trim()))return notice('Answer every question before sending.');respond({answers:Object.fromEntries(inputs.map(([id,i])=>[id,{answers:[i.value]}]))})};box.append(btn)}else{box.append(el('p',p.reason||'Review this action before it runs.'));box.append(el('pre',p.command||JSON.stringify(p,null,2)));if(p.cwd)box.append(el('p','Directory: '+p.cwd));for(const [text,decision]of [['Approve once','accept'],['Deny','decline']]){const btn=el('button',text,decision==='accept'?'primary':'quiet');btn.onclick=()=>respond({decision});box.append(btn)}}panel.append(box)}}
function onEvent(m){const p=m.params||{};if(m.method==='bridge/status'){const was=connected;connected=p.ready;if(p.pending){requests.clear();for(const r of p.pending)requests.set(String(r.id),r);drawRequests()}controls();if(connected&&!was){loadModels().catch(e=>notice(e.message));list().catch(e=>notice(e.message));if(thread)openTask(thread.id).catch(e=>notice(e.message))}return}if(m.id!==undefined){requests.set(String(m.id),m);drawRequests();return}if(m.method==='serverRequest/resolved'){requests.delete(String(p.requestId));drawRequests();return}if(m.method==='bridge/unsupported'){notice('This action needs the desktop client: '+p.method);return}if(m.method==='thread/archived'){removeArchivedTask(p.threadId);return;}if(m.method==='thread/unarchived'){archivedIds.delete(p.threadId);list().catch(e=>notice(e.message));return;}if(m.method==='thread/name/updated'){setTaskName(p.threadId,p.threadName);return;}if(!thread||p.threadId!==thread.id)return;
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
 const status=await api('status');currentUser=status.user;
 $('#login').hidden=true;$('#workspace').hidden=false;connected=status.ready;
 for(const r of status.pending)requests.set(String(r.id),r);
 drawRequests();controls();stream?.close();stream=new EventSource('/api/events');
 const epoch=authEpoch;
 stream.onmessage=e=>{if(epoch===authEpoch)onEvent(JSON.parse(e.data))};
 stream.onerror=()=>{if(epoch!==authEpoch)return;connected=false;controls();api('status').catch(()=>{})};
 if(connected)await Promise.all([list(),loadModels()]);
}
const picker=createPromptPicker({prompt:$('#prompt'),panel:$('#prompt-picker'),rpc,context:()=>({key:authEpoch+'|'+(thread?.cwd||$('#cwd').value),cwd:thread?.cwd||$('#cwd').value,enabled:canWrite()&&connected&&!loadingTask&&!starting&&!turn})});
$('#cwd').addEventListener('input',()=>picker.update());
$('#login-form').onsubmit=async e=>{e.preventDefault();try{await api('login',{username:$('#username').value,password:$('#password').value});$('#password').value='';$('#login-error').textContent='';await enter()}catch(e){$('#login-error').textContent=e.message}};
$('#rename-task').onclick=()=>openRename();
$('#context-archive').onclick=()=>{if(contextTarget)openArchive(contextTarget.taskSummary,contextTarget);};
$('#archive-form').onsubmit=e=>{e.preventDefault();archiveTask();};
$('#archive-cancel').onclick=()=>{closeArchive();controls();};
$('#archive-dialog').oncancel=e=>{e.preventDefault();if(!archiveSaving){closeArchive();controls();}};
$('#context-rename').onclick=()=>{if(contextTarget)openRename(contextTarget.taskSummary,contextTarget);};
$('#task-context-menu').onkeydown=e=>{
 if(e.key==='Escape'){e.preventDefault();closeTaskMenu(true);}
 else if(e.key==='Tab')closeTaskMenu(true);
 else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
  e.preventDefault();const entries=[...$('#task-context-menu').querySelectorAll('button')];
  const current=entries.indexOf(document.activeElement);
  const next=e.key==='Home'?0:e.key==='End'?entries.length-1:(current+(e.key==='ArrowDown'?1:-1)+entries.length)%entries.length;
  entries[next].focus();
 }
};
document.addEventListener('pointerdown',e=>{if(!$('#task-context-menu').contains(e.target))closeTaskMenu();});
document.addEventListener('scroll',()=>closeTaskMenu(),true);
window.addEventListener('resize',()=>closeTaskMenu());
$('#rename-form').onsubmit=e=>{e.preventDefault();saveRename();};
$('#rename-cancel').onclick=()=>{closeRename();controls();};
$('#rename-dialog').oncancel=e=>{e.preventDefault();if(!renameSaving){closeRename();controls();}};
$('#mode').onchange=controls;
$('#attach').onclick=()=>$('#file-input').click();
$('#file-input').onchange=e=>attachFiles(e.target.files);
$('#composer').ondragover=e=>{if(canWrite()){e.preventDefault();e.dataTransfer.dropEffect='copy'}};
$('#composer').ondrop=e=>{e.preventDefault();attachFiles(e.dataTransfer.files)};
$('#composer').onsubmit=e=>{e.preventDefault();sendPrompt($('#prompt').value).catch(e=>notice(e.message))};
$('#prompt').onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();$('#composer').requestSubmit()}};
$('#new-task').onclick=newTask;$('#refresh').onclick=()=>list().catch(e=>notice(e.message));$('#more').onclick=()=>list(true).catch(e=>notice(e.message));$('#stop').onclick=()=>rpc('turn/interrupt',{threadId:thread.id,turnId:turn}).catch(e=>notice(e.message));$('#logout').onclick=async()=>{await api('logout',{});lock();thread=null;items.clear();$('#conversation').replaceChildren();$('#tasks').replaceChildren();$('#prompt').value=''};
const context=document.modelContext;if(context?.registerTool){const lifetime=new AbortController();addEventListener('pagehide',()=>lifetime.abort(),{once:true});try{Promise.resolve(context.registerTool({name:'open_codex_task',description:'Open an existing Codex task in the control room without sending a prompt.',inputSchema:{type:'object',properties:{taskId:{type:'string'}},required:['taskId'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async input=>{if(typeof input?.taskId!=='string'||!input.taskId)throw Error('taskId is required');await openTask(input.taskId);return{taskId:thread.id,title:thread.name}}},{signal:lifetime.signal})).catch(()=>{})}catch{}}
enter().catch(e=>{if($('#login').hidden)notice(e.message)});
