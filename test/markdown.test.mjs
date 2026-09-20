import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {renderLinkedText} from '../dist/links.js';
const dom=new JSDOM('');globalThis.document=dom.window.document;
function render(text){const node=document.createElement('div');renderLinkedText(node,text);return node;}
test('chat renders GitHub-style block and inline Markdown',()=>{
 const node=render('# Heading\n\n**Bold** *italic* ~~removed~~ `code`\n\n> Quote\n\n1. First\n2. Second\n   - Nested\n\n- [x] Done\n- [ ] Pending\n\n---\n\n| Name | Value |\n| --- | --- |\n| A | B |\n\n```js\nconst x = "<script>";\n```');
 for(const selector of ['h1','strong','em','del','code','blockquote','ol','ul','hr','table','th','td','pre code'])assert.ok(node.querySelector(selector),selector);
 assert.equal(node.querySelector('pre code').textContent,'const x = "<script>";\n');
 assert.equal(node.querySelectorAll('input[type=checkbox][disabled]').length,2);
 assert.equal(node.querySelector('input').checked,true);
});
test('links support reference syntax, titles, autolinks and safe schemes',()=>{
 const node=render('[Reference][ref] and <https://example.com> and [mail](mailto:test@example.com)\n\n[ref]: https://example.org "Title"');
 assert.equal(node.querySelectorAll('a').length,3);assert.equal(node.querySelector('a').title,'Title');
 for(const a of node.querySelectorAll('a')){assert.equal(a.target,'_blank');assert.equal(a.rel,'noopener noreferrer');}
});
test('untrusted HTML and unsafe destinations cannot execute or fetch resources',()=>{
 const node=render('<img src=x onerror=alert(1)>\n\n<script>alert(1)</script>\n\n[bad](javascript:alert%281%29) [bad](data:text/html,bad) [bad](/api/logout) [bad](file:///etc/passwd)\n\n![Image](https://example.com/pixel.png)');
 assert.equal(node.querySelectorAll('script,img,iframe,style,svg,form').length,0);
 assert.ok(node.textContent.includes('<script>'));
 assert.equal(node.querySelectorAll('a').length,1);assert.equal(node.querySelector('a').href,'https://example.com/pixel.png');
});
test('code stays literal and streaming rerenders without duplicate content',()=>{
 const node=render('```html\n<a href="javascript:alert(1)">**literal**</a>');
 assert.equal(node.querySelectorAll('a,strong').length,0);assert.ok(node.querySelector('pre code'));
 renderLinkedText(node,'**done**\n\n[link](https://example.com)');assert.equal(node.querySelectorAll('strong').length,1);assert.equal(node.querySelectorAll('a').length,1);assert.equal(node.querySelectorAll('pre').length,0);
});
test('balanced links and fenced code preserve previous safe rendering behavior',()=>{
 assert.equal(render('[Wiki](https://example.com/a_(b))').querySelector('a').href,'https://example.com/a_(b)');
 for(const text of ['`[code](https://example.com)`','  ~~~md\n[code](https://example.com)\n  ~~~','```js\nconst marker = "```";\n[code](https://example.com)\n```'])assert.equal(render(text).querySelectorAll('a').length,0);
 assert.equal(render('[partial](https://example.com').textContent.trim(),'[partial](https://example.com');
 for(const text of ['[bad](JaVaScRiPt:alert%281%29)','[bad](javascript&#58;alert%281%29)','[bad](//evil.example)','[bad](https://example.com/\u0000bad)'])assert.equal(render(text).querySelectorAll('a').length,0,text);
 const node=render('[<img src=x onerror=alert(1)>](https://example.com)');assert.equal(node.querySelectorAll('img').length,0);assert.ok(node.textContent.includes('<img'));
});
test('Markdown entities decode once in link and image destinations and titles',()=>{
 const node=render('[x](https://example.com/?a=1&amp;b=2 "A &amp; B") [encoded](https&#58;//example.org) ![A &amp; B](https://example.com/?a=1&amp;b=2)');
 const links=[...node.querySelectorAll('a')];assert.equal(links[0].href,'https://example.com/?a=1&b=2');assert.equal(links[0].title,'A & B');assert.equal(links[1].href,'https://example.org/');assert.equal(links[2].href,'https://example.com/?a=1&b=2');assert.equal(links[2].textContent,'A & B');
 assert.equal(render('[bad](javascript&#58;alert%281%29) ![bad](javascript&#58;alert%281%29)').querySelectorAll('a').length,0);
});
