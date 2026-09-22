import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

async function setup(role='admin') {
 const dom=new JSDOM(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),{runScripts:'outside-only',url:'http://localhost'});
 const w=dom.window;
 w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.EventSource=class {close(){}};
 w.fetch=async url=>({ok:true,json:async()=>url.endsWith('status')?{ready:true,user:{username:'fixture',role},pending:[]}:{data:[],nextCursor:null}});
 w.eval(`const createProjectsView=()=>({reset(){},hide(){}});const createPromptPicker=()=>({update(){},reset(){}});const renderLinkedText=(n,t)=>n.textContent=t;\n`+readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'')+'\nwindow.testing={onEvent,renderThread,enter};');
 await new Promise(r=>setTimeout(r,20));
 return {w,doc:w.document,close:()=>w.close()};
}

const adminCopy='Choose a task from navigation, or write a prompt below to start.';
const readOnlyCopy='Choose a task from navigation to view the conversation.';
function assertWelcome(doc,copy){
 const panels=doc.querySelectorAll('#conversation .welcome');
 assert.equal(panels.length,1,'exactly one welcome panel');
 const panel=panels[0],heading=panel.querySelector('h2');
 assert.equal(heading.textContent,'Ready when you are');
 assert.equal(panel.getAttribute('aria-labelledby'),heading.id,'panel has a heading-derived accessible name');
 assert.equal(panel.querySelector('p').textContent,copy);
 assert.equal(doc.querySelectorAll('#conversation .message').length,0);
}
for(const role of ['admin','user'])test(`${role} receives a role-appropriate welcome, including re-entry`,async()=>{
 const h=await setup(role);
 try{
  const copy=role==='admin'?adminCopy:readOnlyCopy;
  assertWelcome(h.doc,copy);
  assert.equal(h.doc.querySelector('#task-meta').textContent,role==='admin'?'Choose a task or start something new.':'Choose a task from navigation.');
  assert.equal(h.doc.querySelector('#composer').hidden,role!=='admin');
  h.doc.querySelector('#refresh').focus();
  await h.w.testing.enter();
  assertWelcome(h.doc,copy);
  assert.equal(h.doc.activeElement.id,'refresh','rendering welcome does not move focus');
  h.w.testing.renderThread({id:'selected',turns:[{items:[{id:'reply',type:'agentMessage',text:'Synthetic conversation'}]}]});
  assert.equal(h.doc.querySelector('.welcome'),null);
  assert.match(h.doc.querySelector('#conversation').textContent,/Synthetic conversation/);
  h.w.testing.renderThread({id:'empty-selected',turns:[]});
  assert.equal(h.doc.querySelector('.welcome'),null,'an existing empty task is still selected');
  await h.doc.querySelector('#logout').onclick();
  await h.w.testing.enter();
  assertWelcome(h.doc,copy);
  assert.equal(h.doc.querySelector('#task-title').textContent,'Your next move.','same-page sign-in restores the empty-state header');
 }finally{h.close()}
});
test('New task repeatedly restores one panel and clears history with existing composer semantics',async()=>{
 const h=await setup();
 try{
  h.w.testing.renderThread({id:'selected',turns:[{items:[{id:'reply',type:'agentMessage',text:'Synthetic conversation'}]}]});
  h.doc.querySelector('#prompt').value='Keep this draft';
  h.doc.querySelector('#mode').value='plan';
  for(let i=0;i<3;i++){
   h.doc.querySelector('#new-task').click();
   assertWelcome(h.doc,adminCopy);
   assert.equal(h.doc.querySelector('#prompt').value,'Keep this draft');
   assert.equal(h.doc.querySelector('#mode').value,'default','retain existing New task mode reset');
   assert.equal(h.doc.activeElement.id,'prompt','retain existing New task focus');
  }
  h.w.testing.onEvent({method:'item/agentMessage/delta',params:{threadId:'selected',itemId:'reply',delta:'Late message'}});
  assertWelcome(h.doc,adminCopy);
 }finally{h.close()}
});
test('welcome re-render preserves a draft and selected mode',async()=>{
 const h=await setup();
 try{
  h.doc.querySelector('#prompt').value='Draft in progress';
  h.doc.querySelector('#mode').value='plan';
  h.doc.querySelector('#prompt').focus();
  await h.w.testing.enter();
  assertWelcome(h.doc,adminCopy);
  assert.equal(h.doc.querySelector('#prompt').value,'Draft in progress');
  assert.equal(h.doc.querySelector('#mode').value,'plan');
  assert.equal(h.doc.activeElement.id,'prompt');
 }finally{h.close()}
});
