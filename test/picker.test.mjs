import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createPromptPicker} from '../dist/picker.js';
const skill={name:'review',path:'/repo/SKILL.md',enabled:true,description:'Review code'};
const plugin={id:'github@catalog',name:'github',installed:true,enabled:true,interface:{displayName:'GitHub',shortDescription:'Repository tools'}};
const tick=()=>new Promise(r=>setTimeout(r,0));
function fixture(rpc){
 const dom=new JSDOM('<textarea></textarea><div id="picker" hidden></div><button id="elsewhere">Elsewhere</button>');const doc=dom.window.document,prompt=doc.querySelector('textarea'),panel=doc.querySelector('#picker');let key='A';
 const picker=createPromptPicker({prompt,panel,rpc:rpc|| (async method=>method==='skills/list'?{data:[{skills:[skill,{...skill,name:'off',enabled:false}],errors:[]}]}:{marketplaces:[{plugins:[plugin,{...plugin,id:'off',enabled:false}]}]}),context:()=>({key,cwd:'/repo',enabled:true})});
 const type=text=>{prompt.focus();prompt.value=text;prompt.setSelectionRange(text.length,text.length);prompt.dispatchEvent(new dom.window.Event('input'));};
 const press=key=>prompt.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
 return {dom,doc,prompt,panel,picker,type,press,context:k=>{key=k;picker.update();}};
}
test('keyboard selection sends structured references and edits remove stale selections',async()=>{
 const f=fixture();f.type('$rev');await tick();assert.match(f.panel.textContent,/review/);assert.doesNotMatch(f.panel.textContent,/off/);f.press('Enter');assert.equal(f.prompt.value,'$review ');assert.deepEqual(f.picker.inputs(f.prompt.value),[{type:'skill',name:'review',path:'/repo/SKILL.md'}]);
 f.type('Please '+f.prompt.value);assert.equal(f.picker.inputs(f.prompt.value).length,1);
 f.type(f.prompt.value+'@git');await tick();f.press('Tab');assert.equal(f.picker.inputs(f.prompt.value).length,2);
 f.type(f.prompt.value.replace('$review','$other'));assert.deepEqual(f.picker.inputs(f.prompt.value),[{type:'mention',name:'GitHub',path:'plugin://github@catalog'}]);
 f.type('');assert.deepEqual(f.picker.inputs(''),[]);
});
test('email text does not trigger; Escape and focus departure dismiss loading results',async()=>{
 const pending=[];const f=fixture(()=>new Promise(r=>pending.push(r)));f.type('me@example.com');assert.equal(f.panel.hidden,true);
 f.type('$');assert.equal(f.panel.hidden,false);f.press('Escape');assert.equal(f.panel.hidden,true);pending.forEach(r=>r({data:[{skills:[skill]}],marketplaces:[]}));await tick();assert.equal(f.panel.hidden,true,'Escape remains dismissed after loading');
 const g=fixture();g.type('$');g.doc.querySelector('#elsewhere').focus();await tick();assert.equal(g.panel.hidden,true,'late results must not reopen a blurred picker');
});
test('context changes invalidate late results and old references',async()=>{
 const pending=[];const f=fixture(()=>new Promise(r=>pending.push(r)));f.type('$');f.context('B');pending.forEach(r=>r({data:[{skills:[skill]}],marketplaces:[]}));await tick();assert.equal(f.panel.hidden,true);assert.deepEqual(f.picker.inputs(f.prompt.value),[]);
});
test('partial discovery failure keeps successful results and offers retry',async()=>{
 let fail=true;const f=fixture(async method=>{if(method==='skills/list'){if(fail)throw Error('offline');return {data:[{skills:[skill]}]};}return {marketplaces:[{plugins:[plugin]}]};});
 f.type('@');await tick();assert.match(f.panel.textContent,/Skills unavailable/);assert.match(f.panel.textContent,/GitHub/);fail=false;[...f.panel.querySelectorAll('button')].find(b=>b.textContent==='Retry loading').click();await tick();f.type('$');assert.match(f.panel.textContent,/review/);
});
test('reselecting an identical mention replaces its previous target',async()=>{
 const f=fixture(async method=>method==='skills/list'?{data:[{skills:[{...skill,path:'/one/SKILL.md'},{...skill,path:'/two/SKILL.md'}]}]}:{marketplaces:[]});
 f.type('$rev');await tick();f.press('Enter');assert.equal(f.picker.inputs(f.prompt.value)[0].path,'/one/SKILL.md');
 f.prompt.setSelectionRange('$review'.length,'$review'.length);f.prompt.dispatchEvent(new f.dom.window.Event('click'));f.panel.querySelectorAll('[role=option]')[1].click();
 assert.deepEqual(f.picker.inputs(f.prompt.value),[{type:'skill',name:'review',path:'/two/SKILL.md'}]);
});
