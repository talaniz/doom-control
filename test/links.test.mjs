import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linkParts} from '../dist/links.js';
const links=text=>linkParts(text).filter(p=>p.href);
test('Markdown web and mail links become labeled safe destinations',()=>{
 assert.deepEqual(linkParts('Read [PR #4](https://github.com/a/b/pull/4).'),[{text:'Read '},{text:'PR #4',href:'https://github.com/a/b/pull/4'},{text:'.'}]);
 assert.equal(links('[Wiki](https://example.com/a_(b))')[0].href,'https://example.com/a_(b)');
 assert.equal(links('[Mail](mailto:test@example.com)')[0].href,'mailto:test@example.com');
 assert.equal(links('[Home](<http://192.168.1.158:8787>)')[0].href,'http://192.168.1.158:8787/');
 assert.equal(links('[one](https://one.example) [two](https://two.example)').length,2);
});
test('unsafe schemes, relative paths, HTML and image syntax remain literal',()=>{
 for(const text of ['[bad](javascript:alert(1))','[bad](JaVaScRiPt:alert(1))','[bad](data:text/html,test)','[bad](file:///etc/passwd)','[bad](/api/logout)','[bad](https://example.com/\u0000bad)','![image](https://example.com/pixel.png)','<script>alert(1)</script>']){
  assert.deepEqual(linkParts(text),[{text}],text);
 }
 assert.deepEqual(links('[<img src=x onerror=alert(1)>](https://example.com)'),[{text:'<img src=x onerror=alert(1)>',href:'https://example.com/'}]);
});
test('code examples and incomplete streaming links remain text until complete',()=>{
 for(const text of ['`[code](https://example.com)`','```md\n[code](https://example.com)\n```','~~~md\n[code](https://example.com)\n~~~','```\n[code](https://example.com)','\\[escaped](https://example.com)','[partial](https://example.com'])assert.deepEqual(linkParts(text),[{text}],text);
 assert.equal(links('[partial](https://example.com)').length,1);
 assert.equal(links('`[code](https://example.com)` [real](https://example.com)').length,1);
});
