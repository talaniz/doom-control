import {Marked} from '../node_modules/marked/lib/marked.esm.js';
import createDOMPurify from '../node_modules/dompurify/dist/purify.es.mjs';

const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parser=new Marked({gfm:true,renderer:{
 html:token=>escape(token.text),
 link(token){const label=this.parser.parseInline(token.tokens);return safeDestination(token.href)?`<a href="${escape(token.href)}"${token.title?` title="${escape(token.title)}"`:''}>${label}</a>`:label;},
 // Images remain explicit links: rendering a message must not fetch remote assets.
 image:token=>safeDestination(token.href)?`<a href="${escape(token.href)}">${escape(token.text||'Image')}</a>`:escape(token.text||'Image')
}});
const purifiers=new WeakMap();
function safeDestination(value){
 if(!value||/[\s\u0000-\u001f\u007f]/u.test(value))return null;
 try{const url=new URL(value);return ['http:','https:','mailto:'].includes(url.protocol)?url.href:null;}catch{return null;}
}
export function renderLinkedText(element,text){
 const doc=element.ownerDocument,view=doc.defaultView;
 if(!purifiers.has(view))purifiers.set(view,createDOMPurify(view));
 try{
  const fragment=purifiers.get(view).sanitize(parser.parse(text),{
   RETURN_DOM_FRAGMENT:true,
   ALLOWED_TAGS:['p','br','h1','h2','h3','h4','h5','h6','strong','em','del','blockquote','ul','ol','li','hr','pre','code','a','table','thead','tbody','tr','th','td','input'],
   ALLOWED_ATTR:['href','title','align','start','type','checked','disabled'],
   ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false
  });
  for(const link of fragment.querySelectorAll('a')){
   const href=safeDestination(link.getAttribute('href'));
   if(!href){link.replaceWith(...link.childNodes);continue;}
   link.href=href;link.target='_blank';link.rel='noopener noreferrer';
  }
  for(const input of fragment.querySelectorAll('input')){input.type='checkbox';input.disabled=true;}
  for(const table of fragment.querySelectorAll('table')){
   const wrapper=doc.createElement('div');wrapper.className='markdown-table';wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label','Scrollable table');table.replaceWith(wrapper);wrapper.append(table);
  }
  element.replaceChildren(fragment);
 }catch{
  // A partial or unusually complex response must remain readable if parsing fails.
  element.textContent=text;
 }
}
