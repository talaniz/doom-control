import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {UploadStore,MAX_FILE_BYTES} from '../uploads.mjs';
const request=(name,chunks)=>{const req=Readable.from(chunks);req.headers={'x-file-name':encodeURIComponent(name)};return req;};
test('upload lifecycle survives restart, pins sent files, and cleans incomplete uploads',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'doom-uploads-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=new UploadStore(dir),data=Buffer.from([0,255,127,17]);
 const file=await store.save(request('binary.dat',[data]),'admin');
 assert.equal(file.size,4);assert.equal((await stat(join(dir,'uploads',file.id,'file-binary.dat'))).mode&0o777,0o600);
 assert.deepEqual(await readFile(join(dir,'uploads',file.id,'file-binary.dat')),data);
 const resumed=new UploadStore(dir);const records=resumed.inputs([file.id],'admin');resumed.pin(records);
 await assert.rejects(new UploadStore(dir).remove(file.id,'admin'),{status:409});
 assert.throws(()=>resumed.inputs([file.id],'other'),{status:404});
 assert.throws(()=>resumed.inputs(Array(6).fill(file.id),'admin'),{status:400});
 const orphan=join(dir,'uploads','a'.repeat(32));await mkdir(orphan);await writeFile(join(orphan,'file-incomplete.bin'),data);
 new UploadStore(dir);
 assert.ok(!(await readdir(join(dir,'uploads'))).includes('a'.repeat(32)),'restart must reclaim incomplete uploads');
});
test('streaming over-limit data is rejected and partial output removed',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'doom-upload-limit-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=new UploadStore(dir);
 await assert.rejects(store.save(request('large.bin',[Buffer.alloc(MAX_FILE_BYTES),Buffer.from('x')]),'admin'),{status:413});
 assert.deepEqual(await readdir(join(dir,'uploads')),[]);
 assert.equal(store.busy,false);
});
