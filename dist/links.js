// Deliberately renders links only: all other message content remains literal text.
function safeDestination(value){
 const raw=value.startsWith('<')&&value.endsWith('>')?value.slice(1,-1):value;
 if(!raw||/[\s\u0000-\u001f\u007f]/u.test(raw))return null;
 try{const url=new URL(raw);return ['http:','https:','mailto:'].includes(url.protocol)?url.href:null;}catch{return null;}
}
function markdownLink(text,start){
 // Bound lookahead so malformed streamed content cannot cause unbounded rescanning.
 const limit=Math.min(text.length,start+8192);
 let labelEnd=start+1;
 for(;labelEnd<limit;labelEnd++){
  if(text[labelEnd]==='\\'){labelEnd++;continue;}
  if(text[labelEnd]==='\n'||text[labelEnd]==='[')return null;
  if(text[labelEnd]===']')break;
 }
 if(labelEnd>=limit||text[labelEnd+1]!=='(')return null;
 let end=labelEnd+2,depth=1;
 for(;end<limit;end++){
  if(text[end]==='\\'){end++;continue;}
  if(text[end]==='\n')return null;
  if(text[end]==='(')depth++;
  if(text[end]===')'&&--depth===0)break;
 }
 if(depth!==0)return {end:limit,href:null};
 const destination=text.slice(labelEnd+2,end).replace(/\\([\\()])/g,'$1');
 const label=text.slice(start+1,labelEnd).replace(/\\([\\\[\]])/g,'$1');
 return {end:end+1,href:label?safeDestination(destination):null,label};
}
export function linkParts(text){
 const parts=[];let plain='';
 const flush=()=>{if(plain){parts.push({text:plain});plain='';}};
 for(let i=0;i<text.length;){
  if(text[i]==='\\'&&i+1<text.length){plain+=text.slice(i,i+2);i+=2;continue;}
  // Fences start/finish on delimiter lines; marker strings inside code are literal.
  if(i===0||text[i-1]==='\n'){
   const opening=/ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/y;opening.lastIndex=i;
   const match=opening.exec(text);
   if(match){
    const marker=match[1];
    const closing=new RegExp('^ {0,3}'+marker[0]+'{'+marker.length+',}[ \t]*\r?$','gm');
    closing.lastIndex=opening.lastIndex;const endMatch=closing.exec(text);
    const end=endMatch?endMatch.index+endMatch[0].length:text.length;
    plain+=text.slice(i,end);i=end;continue;
   }
  }
  if(text[i]==='`'){
   let width=1;while(text[i+width]==='`')width++;
   const runs=/`+/g;runs.lastIndex=i+width;let match,end=text.length;
   while((match=runs.exec(text)))if(match[0].length===width){end=runs.lastIndex;break;}
   plain+=text.slice(i,end);i=end;continue;
  }
  const image=text[i]==='!'&&text[i+1]==='[';
  if(text[i]==='['||image){
   const match=markdownLink(text,i+(image?1:0));
   if(match){
    if(match.href&&!image){flush();parts.push({text:match.label,href:match.href});}
    else plain+=text.slice(i,match.end);
    i=match.end;continue;
   }
  }
  plain+=text[i++];
 }
 flush();return parts;
}
export function renderLinkedText(element,text){
 element.replaceChildren();
 for(const part of linkParts(text)){
  if(!part.href){element.append(document.createTextNode(part.text));continue;}
  const link=document.createElement('a');link.textContent=part.text;link.href=part.href;
  link.target='_blank';link.rel='noopener noreferrer';element.append(link);
 }
}
