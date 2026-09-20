import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {hashUser,loadUsers,authenticate} from '../auth.mjs';

test('salted password records validate credentials and reject invalid roles/duplicates',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'doom-auth-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const first=await hashUser({username:'fixture-admin',password:'test-only',role:'admin'});
 const second=await hashUser({username:'fixture-admin',password:'test-only',role:'admin'});
 assert.notEqual(first.salt,second.salt);assert.notEqual(first.passwordHash,second.passwordHash);
 const file=join(dir,'users.json');await writeFile(file,JSON.stringify({version:1,users:[first]}));
 const users=loadUsers(file);
 assert.deepEqual(await authenticate(users,'fixture-admin','test-only'),{username:'fixture-admin',role:'admin'});
 for(const [name,password] of [['fixture-admin','wrong'],['absent','test-only'],['fixture-admin',null],['fixture-admin','x'.repeat(1025)]])assert.equal(await authenticate(users,name,password),null);
 for(const record of [{...first,role:'owner'},{...first,passwordHash:'invalid'}]){await writeFile(file,JSON.stringify({version:1,users:[record]}));assert.throws(()=>loadUsers(file));}
 await writeFile(file,JSON.stringify({version:1,users:[first,second]}));assert.throws(()=>loadUsers(file),/duplicate/);
 await assert.rejects(hashUser({username:'admin',password:'',role:'admin'}));
});

test('provisioner writes private hashes atomically and preserves existing accounts on invalid input',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'doom-provision-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const run=input=>new Promise(resolve=>{const child=spawn(process.execPath,['scripts/provision-users.mjs'],{env:{...process.env,DOOM_STATE_DIR:dir},stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('exit',code=>resolve({code,output}));child.stdin.end(JSON.stringify(input));});
 const password='fixture-secret-not-for-production';const result=await run([{username:'fixture-admin',password,role:'admin'},{username:'fixture-reader',password,role:'user'}]);assert.equal(result.code,0);assert.ok(!result.output.includes(password));
 const file=join(dir,'users.json'),before=await readFile(file,'utf8');assert.ok(!before.includes(password));assert.equal((await stat(file)).mode&0o777,0o600);assert.equal((await stat(dir)).mode&0o777,0o700);
 assert.equal((await authenticate(loadUsers(file),'fixture-reader',password)).role,'user');
 for(const data of [[{username:'reader',password,role:'user'}],[{username:'admin',password,role:'owner'}]]){assert.equal((await run(data)).code,1);assert.equal(await readFile(file,'utf8'),before);}
});
