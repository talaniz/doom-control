import {scrypt,randomBytes,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
const derive=promisify(scrypt);
const usernamePattern=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;
const roles=new Set(['admin','user']);
export async function hashUser({username,password,role}){
 if(typeof username!=='string'||!usernamePattern.test(username)||!roles.has(role)||typeof password!=='string'||password.length<1||password.length>1024)throw Error('Invalid username, password, or role');
 const salt=randomBytes(16).toString('hex');
 return {username,role,salt,passwordHash:(await derive(password,salt,64)).toString('hex')};
}
export function loadUsers(path){
 const data=JSON.parse(readFileSync(path,'utf8'));
 if(data.version!==1||!Array.isArray(data.users)||!data.users.length)throw Error('Invalid users file');
 const users=new Map();
 for(const u of data.users){
  if(!u||!usernamePattern.test(u.username)||typeof u.username!=='string'||!roles.has(u.role)||!/^[a-f0-9]{32}$/.test(u.salt)||!/^[a-f0-9]{128}$/.test(u.passwordHash)||users.has(u.username))throw Error('Invalid or duplicate user record');
  users.set(u.username,{username:u.username,role:u.role,salt:u.salt,passwordHash:u.passwordHash});
 }
 if(!data.users.some(u=>u.role==='admin'))throw Error('At least one administrator is required');
 return users;
}
export async function authenticate(users,username,password){
 if(typeof username!=='string'||typeof password!=='string'||username.length>64||password.length>1024)return null;
 const user=users.get(username);
 // Unknown accounts do the same expensive password work and return the same error.
 const salt=user?.salt||'0'.repeat(32),expected=Buffer.from(user?.passwordHash||'0'.repeat(128),'hex');
 const actual=await derive(password,salt,64);
 return timingSafeEqual(actual,expected)&&user?{username:user.username,role:user.role}:null;
}
