// A textarea picker keeps structured references separate from editable prompt text.
export function createPromptPicker({prompt,panel,rpc,context}){
 const doc=prompt.ownerDocument;
 let key='',generation=0,catalog=null,loading=false,errors=[],rows=[],active=0,trigger=null,dismissed=null;
 let previous=prompt.value,references=[];
 const node=(tag,text)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 const hide=()=>{panel.hidden=true;prompt.setAttribute('aria-expanded','false');prompt.removeAttribute('aria-activedescendant');trigger=null;};
 function reset(){generation++;catalog=null;loading=false;errors=[];references=[];previous=prompt.value;dismissed=null;hide();}
 function state(){const c=context();if(c.key!==key){key=c.key;reset();}if(!c.enabled)hide();return c;}
 function sync(){
  const value=prompt.value;if(value===previous)return;
  let start=0;while(start<value.length&&start<previous.length&&value[start]===previous[start])start++;
  let oldEnd=previous.length,newEnd=value.length;
  while(oldEnd>start&&newEnd>start&&previous[oldEnd-1]===value[newEnd-1]){oldEnd--;newEnd--;}
  const delta=newEnd-oldEnd;
  references=references.flatMap(ref=>{
   if(ref.end<=start)return [ref];
   if(ref.start>=oldEnd)return [{...ref,start:ref.start+delta,end:ref.end+delta}];
   return [];
  });
  previous=value;dismissed=null;
 }
 function findTrigger(){
  if(prompt.selectionStart!==prompt.selectionEnd)return null;
  const end=prompt.selectionStart,prefix=prompt.value.slice(0,end);
  const match=/(?:^|\s)([$@])([\w:.-]*)$/u.exec(prefix);
  if(!match||/[\w:.-]/u.test(prompt.value[end]||''))return null;
  return {symbol:match[1],query:match[2].toLowerCase(),start:end-match[2].length-1,end};
 }
 async function load(){
  const c=state();if(!c.enabled||loading||catalog)return;
  const serial=generation;loading=true;draw();
  const results=await Promise.allSettled([rpc('skills/list',{cwds:[c.cwd],forceReload:true}),rpc('plugin/installed',{cwds:[c.cwd]})]);
  if(serial!==generation)return;
  const entries=[];errors=[];
  const [skills,plugins]=results;
  if(skills.status==='fulfilled'){
   for(const group of skills.value.data||[]){
    if(group.errors?.length)errors.push('Some skills could not be loaded.');
    for(const skill of group.skills||[])if(skill.enabled&&skill.name&&skill.path)entries.push({symbol:'$',name:skill.name,label:skill.interface?.displayName||skill.name,description:skill.interface?.shortDescription||skill.shortDescription||skill.description||'',detail:skill.path,token:'$'+skill.name,input:{type:'skill',name:skill.name,path:skill.path}});
   }
  }else errors.push('Skills unavailable.');
  if(plugins.status==='fulfilled'){
   if(plugins.value.marketplaceLoadErrors?.length)errors.push('Some plugins could not be loaded.');
   for(const marketplace of plugins.value.marketplaces||[])for(const plugin of marketplace.plugins||[])if(plugin.installed&&plugin.enabled&&plugin.availability!=='DISABLED_BY_ADMIN'&&!plugin.disabledReason){
    const label=plugin.interface?.displayName||plugin.name;
    if(!plugin.id||!label)continue;
    entries.push({symbol:'@',name:plugin.name,label,description:plugin.interface?.shortDescription||'',detail:plugin.id,token:'@'+(label.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-|-$/g,'')||plugin.name),input:{type:'mention',name:label,path:'plugin://'+plugin.id}});
   }
  }else errors.push('Plugins unavailable.');
  catalog=[...new Map(entries.map(e=>[e.symbol+e.input.path,e])).values()].sort((a,b)=>a.label.localeCompare(b.label));loading=false;draw();
 }
 function choose(entry){
  if(!state().enabled||!trigger)return;
  sync();const current=findTrigger();if(!current||current.start!==trigger.start)return hide();
  const {start,end}=current;
  prompt.setRangeText(entry.token+' ',start,end,'end');sync();
  references.push({start,end:start+entry.token.length,token:entry.token,input:entry.input});
  previous=prompt.value;hide();prompt.focus();
 }
 function draw(){
  if(!state().enabled)return;
  if(doc.activeElement!==prompt&&!panel.contains(doc.activeElement)){hide();return;}
  sync();const match=findTrigger();if(!match||dismissed===prompt.value+'|'+prompt.selectionStart){hide();return;}
  trigger=match;rows=(catalog||[]).filter(e=>e.symbol===match.symbol&&[e.name,e.label,e.description].some(v=>v.toLowerCase().includes(match.query)));
  active=Math.min(active,Math.max(0,rows.length-1));panel.replaceChildren();
  const status=node('p',loading?'Loading…':errors.length?errors.join(' '):rows.length?`${match.symbol==='$'?'Skills':'Plugins'} · ↑ ↓ to browse · Enter to select · Esc to close`:'No matching '+(match.symbol==='$'?'skills':'plugins')+'.');status.setAttribute('role','status');panel.append(status);
  const list=node('div');list.id='prompt-options';list.setAttribute('role','listbox');list.setAttribute('aria-label',match.symbol==='$'?'Skills':'Plugins');
  rows.forEach((entry,i)=>{
   const option=node('button');option.type='button';option.id='prompt-option-'+i;option.setAttribute('role','option');option.setAttribute('aria-selected',String(i===active));option.tabIndex=-1;
   option.append(node('strong',entry.label),node('small',entry.description),node('small',entry.detail));
   option.onmousedown=e=>e.preventDefault();option.onclick=()=>choose(entry);list.append(option);
  });panel.append(list);
  if(errors.length){const retry=node('button','Retry loading');retry.type='button';retry.onclick=()=>{catalog=null;load();prompt.focus();};panel.append(retry);}
  panel.hidden=false;prompt.setAttribute('aria-expanded','true');
  if(rows.length)prompt.setAttribute('aria-activedescendant','prompt-option-'+active);else prompt.removeAttribute('aria-activedescendant');
 }
 function refresh(){state();sync();active=0;draw();if(trigger&&!catalog&&!loading)void load();}
 prompt.setAttribute('role','combobox');prompt.setAttribute('aria-haspopup','listbox');prompt.setAttribute('aria-autocomplete','list');prompt.setAttribute('aria-controls','prompt-options');prompt.setAttribute('aria-expanded','false');
 prompt.addEventListener('input',refresh);prompt.addEventListener('click',refresh);
 prompt.addEventListener('keyup',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key))refresh();});
 prompt.addEventListener('blur',e=>{if(!panel.contains(e.relatedTarget))hide();});
 prompt.addEventListener('keydown',e=>{
  if(e.isComposing||e.ctrlKey||e.metaKey||e.altKey||panel.hidden)return;
  if(e.key==='Escape'){e.preventDefault();dismissed=prompt.value+'|'+prompt.selectionStart;hide();}
  else if(rows.length&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();active=(active+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length;draw();doc.getElementById('prompt-option-'+active)?.scrollIntoView?.({block:'nearest'});}
  else if(rows.length&&['Enter','Tab'].includes(e.key)){e.preventDefault();choose(rows[active]);}
 });
 return {
  update:()=>{state();},reset,
  inputs(text){state();sync();const seen=new Set();return references.filter(ref=>{
   const valid=text.slice(ref.start,ref.end)===ref.token&&(ref.start===0||/\s/.test(text[ref.start-1]))&&(ref.end===text.length||!/[-\w:.]/u.test(text[ref.end]));
   if(!valid||seen.has(ref.input.path))return false;seen.add(ref.input.path);return true;
  }).map(ref=>ref.input);}
 };
}
