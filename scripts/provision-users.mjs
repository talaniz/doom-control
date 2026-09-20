// Read plaintext account definitions from stdin; never put passwords in argv or Git.
import {mkdir,writeFile,rename,chmod,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {hashUser} from '../auth.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const state=resolve(process.env.DOOM_STATE_DIR||join(root,'.private'));
let temp;
try{
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>1048576)throw Error('Input too large');}
 const definitions=JSON.parse(input);
 if(!Array.isArray(definitions)||!definitions.length||definitions.length>100)throw Error('Expected 1–100 account definitions');
 const users=[];
 for(const definition of definitions){const u=await hashUser(definition);if(users.some(x=>x.username===u.username))throw Error('Duplicate username');users.push(u);}
 if(!users.some(u=>u.role==='admin'))throw Error('At least one administrator is required');
 await mkdir(state,{recursive:true,mode:0o700});await chmod(state,0o700);
 temp=join(state,`.users-${randomBytes(12).toString('hex')}.tmp`);
 await writeFile(temp,JSON.stringify({version:1,users},null,2)+'\n',{flag:'wx',mode:0o600});
 await rename(temp,join(state,'users.json'));
 console.log(`Saved ${users.length} accounts. Restart the bridge to apply changes and revoke existing sessions.`);
}catch(error){if(temp)await rm(temp,{force:true}).catch(()=>{});console.error('Account provisioning failed:',error.message);process.exitCode=1;}
