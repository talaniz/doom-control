import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

async function setup(data) {
 const dom=new JSDOM(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),{runScripts:'outside-only',url:'http://localhost'});
 const w=dom.window;
 w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.EventSource=class {close(){}};
 let rows=data;
 w.fetch=async(url,options)=>({ok:true,json:async()=>url.endsWith('status')?{ready:true,user:{username:'fixture',role:'admin'},pending:[]}:JSON.parse(options.body).method==='thread/list'?(typeof rows==='function'?await rows(JSON.parse(options.body).params):{data:rows,nextCursor:null}):{data:[]}});
 w.eval(`const createProjectsView=()=>({reset(){},hide(){}});const createPromptPicker=()=>({update(){},reset(){}});const renderLinkedText=(n,t)=>n.textContent=t;\n`+readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'')+'\nwindow.testing={list,onEvent,renderThread};');
 await new Promise(r=>setTimeout(r,20));
 return {w,doc:w.document,setRows:next=>{rows=next},refresh:async next=>{rows=next;await w.testing.list()},close:()=>w.close()};
}
const row=(id,extra={})=>({id,preview:'Review diagnostic test ordinary user work',updatedAt:1,...extra});
test('initial and refreshed lists filter explicit provenance only, preserving selected history and draft',async()=>{
 const visible=[row('user',{source:'cli'}),row('unknown'),row('ambiguous',{source:{custom:'diagnostic'}}),row('malformed',{source:{subAgent:{thread_spawn:{}}}}),row('lookalike',{originator:'prime_mover_user'})];
 const internal=[row('implementation',{originator:'prime_mover'}),row('review',{source:{subAgent:'review'}}),row('e2e',{parentThreadId:'parent'}),row('probe',{source:{subAgent:{other:'probe'}}})];
 const h=await setup([...visible,...internal]);
 try {
 assert.deepEqual([...h.doc.querySelectorAll('#tasks button')].map(b=>b.dataset.id),visible.map(t=>t.id));
 h.w.testing.renderThread({...internal[0],turns:[{items:[{id:'message',type:'agentMessage',text:'Selected history'}]}]});
 h.doc.querySelector('#prompt').value='Unsent draft';
 await h.refresh([...internal,...visible]);
 assert.equal(h.doc.querySelector('#prompt').value,'Unsent draft');
 assert.match(h.doc.querySelector('#conversation').textContent,/Selected history/);
 h.setRows([...internal,...visible,row('new-user',{preview:'Build a useful new task'})]);
 h.w.testing.onEvent({method:'thread/started',params:{thread:row('spawned',{source:{subAgent:'review'}})}});
 await new Promise(r=>setTimeout(r,20));
 assert.equal(h.doc.querySelector('[data-id="spawned"]'),null);
 assert.equal(h.doc.querySelector('[data-id="new-user"]').firstChild.textContent,'Build a useful new');
 }finally{h.close()}
});
test('fallback titles have four words, explicit names and streamed renames remain intact',async()=>{
 const custom='My deliberately long user authored task name';
 const h=await setup([row('fallback'),row('custom',{name:custom}),row('four',{preview:'  One\t two\nthree   four  '})]);
 try {
 assert.equal(h.doc.querySelector('[data-id="fallback"]').firstChild.textContent,'Review diagnostic test ordinary');
 assert.equal(h.doc.querySelector('[data-id="custom"]').firstChild.textContent,custom);
 assert.equal(h.doc.querySelector('[data-id="four"]').firstChild.textContent,'One two three four');
 h.w.testing.renderThread(row('fallback'));
 assert.equal(h.doc.querySelector('#task-title').textContent,'Review diagnostic test ordinary');
 h.w.testing.onEvent({method:'thread/name/updated',params:{threadId:'fallback',threadName:custom}});
 assert.equal(h.doc.querySelector('#task-title').textContent,custom);
 await h.refresh([row('fallback',{name:custom})]);
 assert.equal(h.doc.querySelector('#tasks button').firstChild.textContent,custom);
 }finally{h.close()}
});

test('fallback boundaries include empty, one word, Unicode whitespace, and custom names identical to prompts',async()=>{
 const rows=[row('empty',{preview:' \t '}),row('one',{preview:'Build'}),row('unicode',{preview:'One\u2003two three four five'}),row('explicit',{name:'Review diagnostic test ordinary user work'})];
 const h=await setup(rows);
 try{assert.deepEqual([...h.doc.querySelectorAll('#tasks button')].map(b=>b.firstChild.textContent),['Untitled task','Build','One two three four','Review diagnostic test ordinary user work']);}finally{h.close()}
});

test('filtered pages keep Load more available and append visible results without losing drafts',async()=>{
 const h=await setup(()=>({data:[row('internal',{originator:'prime_mover'})],nextCursor:'page2'}));
 try{
 assert.equal(h.doc.querySelector('#tasks').children.length,0);
 assert.equal(h.doc.querySelector('#more').hidden,false);
 assert.match(h.doc.querySelector('#task-list-status').textContent,/Load more/);
 h.doc.querySelector('#prompt').value='Draft';
 h.setRows(params=>{assert.equal(params.cursor,'page2');return {data:[row('user')],nextCursor:null}});
 await h.w.testing.list(true);
 assert.equal(h.doc.querySelector('#tasks button').dataset.id,'user');
 assert.equal(h.doc.querySelector('#more').hidden,true);
 assert.equal(h.doc.querySelector('#prompt').value,'Draft');
 }finally{h.close()}
});
test('late refresh responses cannot replace newer results; failures preserve current list',async()=>{
 const h=await setup([row('initial')]);
 try{
 let resolve;h.setRows(()=>new Promise(r=>{resolve=r}));
 const pending=h.w.testing.list();
 await new Promise(r=>setTimeout(r,0));
 assert.equal(h.doc.querySelector('#task-list-status').textContent,'Loading tasks…');
 await h.refresh([row('newer')]);resolve({data:[row('older')],nextCursor:null});await pending;
 assert.equal(h.doc.querySelector('#tasks button').dataset.id,'newer');
 h.setRows(()=>{throw Error('Fixture failure')});await assert.rejects(h.w.testing.list());
 assert.equal(h.doc.querySelector('#tasks button').dataset.id,'newer');
 assert.equal(h.doc.querySelector('#task-list-status').textContent,'Could not load tasks. Try Refresh.');
 }finally{h.close()}
});

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const ids=h=>[...h.doc.querySelectorAll('#tasks button')].map(button=>button.dataset.id);
function retainDraft(h){
 h.w.testing.renderThread({...row('selected'),turns:[{items:[{id:'history',type:'agentMessage',text:'Retained conversation'}]}]});
 h.doc.querySelector('#prompt').value='Retained draft';
}
function assertDraft(h){
 assert.equal(h.doc.querySelector('#prompt').value,'Retained draft');
 assert.match(h.doc.querySelector('#conversation').textContent,/Retained conversation/);
}
test('pagination cannot supersede a pending first-page refresh or use its old cursor',async()=>{
 const h=await setup(()=>({data:[row('old')],nextCursor:'old-page'}));
 try{
 retainDraft(h);
 const calls=[];let resolve;
 h.setRows(params=>{calls.push(params);return new Promise(r=>{resolve=r})});
 const refresh=h.w.testing.list();await tick();
 const pagination=h.w.testing.list(true);await tick();
 assert.equal(calls.length,1,'Load more must not send the old cursor while refresh is pending');
 assert.equal(h.doc.querySelector('#more').disabled,true);
 resolve({data:[row('fresh'),row('internal',{originator:'prime_mover'})],nextCursor:'fresh-page'});
 await Promise.all([refresh,pagination]);
 assert.deepEqual(ids(h),['fresh']);assertDraft(h);
 assert.equal(h.doc.querySelector('#more').disabled,false);
 h.setRows(params=>{assert.equal(params.cursor,'fresh-page');return {data:[row('page2')],nextCursor:null}});
 await h.w.testing.list(true);
 assert.deepEqual(ids(h),['fresh','page2']);assert.equal(h.doc.querySelector('#more').hidden,true);assertDraft(h);
 }finally{h.close()}
});
for(const order of ['page-first','refresh-first'])test(`obsolete pagination cannot alter replacement results: ${order}`,async()=>{
 const h=await setup(()=>({data:[row('old')],nextCursor:'old-page'}));
 try{
 retainDraft(h);const pending=[];
 h.setRows(params=>new Promise(resolve=>pending.push({params,resolve})));
 const page=h.w.testing.list(true);await tick();const refresh=h.w.testing.list();await tick();
 assert.equal(pending[0].params.cursor,'old-page');assert.equal(pending[1].params.cursor,undefined);
 const finishPage=()=>pending[0].resolve({data:[row('obsolete')],nextCursor:null});
 const finishRefresh=()=>pending[1].resolve({data:[row('fresh'),row('hidden',{originator:'prime_mover'})],nextCursor:'fresh-page'});
 if(order==='page-first'){finishPage();await page;assert.equal(h.doc.querySelector('#more').disabled,true);finishRefresh();}else{finishRefresh();await refresh;finishPage();}
 await Promise.all([page,refresh]);assert.deepEqual(ids(h),['fresh']);assert.equal(h.doc.querySelector('#more').hidden,false);assertDraft(h);
 h.setRows(params=>{assert.equal(params.cursor,'fresh-page');return {data:[row('fresh-page')],nextCursor:null}});
 await h.w.testing.list(true);assert.deepEqual(ids(h),['fresh','fresh-page']);
 }finally{h.close()}
});
for(const menu of [false,true])for(const removed of [false,true])test(`background refresh preserves deliberate focus: menu=${menu}, removed=${removed}`,async()=>{
 const h=await setup([row('target'),row('survivor')]);
 try{
 retainDraft(h);const target=h.doc.querySelector('[data-id="target"]');target.focus();
 if(menu)target.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ContextMenu',bubbles:true,cancelable:true}));
 assert.equal(h.doc.activeElement,menu?h.doc.querySelector('#context-rename'):target);
 h.setRows(removed?[row('survivor')]:[row('target'),row('survivor')]);
 h.w.testing.onEvent({method:'thread/started',params:{thread:row('internal',{originator:'prime_mover'})}});await tick();
 assert.equal(h.doc.activeElement,h.doc.querySelector(`[data-id="${removed?'survivor':'target'}"]`));
 assert.equal(h.doc.querySelector('#task-context-menu').hidden,true);assertDraft(h);
 }finally{h.close()}
});
for(const menu of [false,true])test(`delayed background refresh does not steal focus from composer: menu=${menu}`,async()=>{
 const h=await setup([row('target')]);
 try{
 retainDraft(h);const target=h.doc.querySelector('#tasks button');target.focus();
 if(menu)target.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ContextMenu',bubbles:true,cancelable:true}));
 let resolve;h.setRows(()=>new Promise(r=>{resolve=r}));
 h.w.testing.onEvent({method:'thread/started',params:{thread:row('internal',{originator:'prime_mover'})}});await tick();
 h.doc.querySelector('#prompt').focus();resolve({data:[row('target')],nextCursor:null});await tick();
 assert.equal(h.doc.activeElement,h.doc.querySelector('#prompt'));assertDraft(h);
 }finally{h.close()}
});
test('removing the final focused task provides a visible refresh fallback',async()=>{
 const h=await setup([row('target')]);
 try{h.doc.querySelector('#tasks button').focus();await h.refresh([]);assert.equal(h.doc.activeElement,h.doc.querySelector('#refresh'));}finally{h.close()}
});

test('failed refresh re-enables pagination of the retained list',async()=>{
 const h=await setup(()=>({data:[row('retained')],nextCursor:'retained-page'}));
 try{
 h.setRows(()=>{throw Error('Fixture failure')});await assert.rejects(h.w.testing.list());
 assert.equal(h.doc.querySelector('#more').disabled,false);assert.deepEqual(ids(h),['retained']);
 h.setRows(params=>{assert.equal(params.cursor,'retained-page');return {data:[row('page2')],nextCursor:null}});
 await h.w.testing.list(true);assert.deepEqual(ids(h),['retained','page2']);
 }finally{h.close()}
});
