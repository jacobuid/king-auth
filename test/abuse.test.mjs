import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {getMigrations} from 'better-auth/db/migration';
import {createAuth} from '../server/auth.mjs';
import {loadConfig} from '../server/config.mjs';

async function fixture(){
  const database=new DatabaseSync(':memory:');const sent=[],alerts=[];let ip=0,cookie='';
  const config=loadConfig({AUTH_BASE_URL:'http://localhost:3000',SIGNUP_APPROVAL_REQUIRED:'false'});
  const auth=createAuth({config,database,sender:{emailEnabled:true,smsEnabled:false,email:async data=>sent.push(data),accountLocked:async data=>alerts.push(data)}});
  await(await getMigrations(auth.options)).runMigrations();
  async function request(path,body,form=false){
    const response=await auth.handler(new Request(config.baseURL+'/api/auth/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:config.baseURL,'x-king-auth-client-ip':'192.0.2.'+(++ip),...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'})},body:body===undefined?undefined:form?new URLSearchParams(body):JSON.stringify(body)}));
    const cookies=response.headers.getSetCookie();if(cookies.length)cookie=cookies.map(item=>item.split(';')[0]).join('; ');
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:response.status,data,headers:response.headers};
  }
  const email='family@example.test',password='Family password 123!';
  const signup=await request('sign-up/email',{name:'Family',email,password});assert.equal(signup.status,200);
  await request('email-otp/verify-email',{email,otp:sent.at(-1).otp});const firstCookie=cookie;
  const login=(passwordAttempt=password,code)=>request('sign-in/email',{email,password:passwordAttempt,...(code?{loginCode:code}:{})});
  async function send(){database.prepare('UPDATE user SET loginCodeSentAt=NULL').run();await request('sign-in-code/send',{email});return sent.at(-1).otp;}
  const row=()=>database.prepare('SELECT * FROM user WHERE email=?').get(email);
  async function lock(){assert.equal((await login('Incorrect password 123!')).status,401);assert.equal((await login('Incorrect password 123!')).data.code,'EMAIL_CODE_REQUIRED');for(let count=3;count<=5;count++){const code=await send();const response=await login('Incorrect password 123!',code);assert.equal(response.data.code,count===5?'ACCOUNT_LOCKED':'EMAIL_CODE_REQUIRED',JSON.stringify(response.data));}assert.equal(row().failedSignIns,5);assert.equal(row().signInLocked,1);}
  const act=(url,extra={})=>request('account-security/confirm',{...Object.fromEntries(new URL(url).searchParams),...extra},true);
  return {database,sent,alerts,request,login,send,row,lock,act,email,password,setCookie:value=>{cookie=value;},firstCookie};
}

test('two wrong passwords require a single-use email code; cooldown, attempt bound and counter reset',async()=>{
  const f=await fixture();try{
    assert.equal((await f.login('Incorrect password 123!')).status,401);
    assert.equal((await f.login('Incorrect password 123!')).data.code,'EMAIL_CODE_REQUIRED');assert.equal(f.row().failedSignIns,2);
    assert.equal((await f.login()).data.code,'EMAIL_CODE_REQUIRED');
    const code=await f.send();const sent=f.sent.length;
    await f.request('sign-in-code/send',{email:f.email});assert.equal(f.sent.length,sent);
    assert.equal((await f.login(f.password,code)).status,200);assert.equal(f.row().failedSignIns,0);
    await f.login('Incorrect password 123!');await f.login('Incorrect password 123!');
    assert.equal((await f.login(f.password,code)).data.code,'EMAIL_CODE_REQUIRED');
    const fresh=await f.send();const wrong=fresh==='000000'?'111111':'000000';
    for(let i=0;i<3;i++)assert.equal((await f.login(f.password,wrong)).data.code,'EMAIL_CODE_REQUIRED');
    assert.equal((await f.login(f.password,fresh)).data.code,'EMAIL_CODE_REQUIRED');assert.equal(f.row().failedSignIns,2);
    assert.equal(f.alerts.length,0);
  }finally{f.database.close();}
});

test('five wrong passwords across IPs lock once, revoke sessions, and require confirmed owner recovery',async()=>{
  const f=await fixture();try{
    await f.lock();assert.equal(f.alerts.length,1);assert.equal(f.alerts[0].ownerEmail,'jacobuid@gmail.com');
    assert.equal((await f.login()).data.code,'ACCOUNT_LOCKED');assert.equal(f.alerts.length,1);
    f.setCookie(f.firstCookie);assert.equal((await f.request('get-session')).data,null);
    const link=new URL(f.alerts[0].links.unlock);
    assert.equal((await f.request('account-security'+link.search)).status,200);assert.equal(f.row().signInLocked,1);
    const tampered=new URL(link);tampered.searchParams.set('action','delete');assert.equal((await f.act(tampered)).status,400);
    assert.equal((await f.act(link)).status,200);assert.equal(f.row().signInLocked,0);assert.equal(f.row().failedSignIns,0);
    assert.equal((await f.act(link)).status,400);assert.equal((await f.login()).status,200);
    await f.lock();const passwordLink=f.alerts.at(-1).links.password;
    assert.equal((await f.act(passwordLink,{password:'A changed password 123!',confirmPassword:'wrong'})).status,400);
    assert.equal((await f.act(passwordLink,{password:'A changed password 123!',confirmPassword:'A changed password 123!'})).status,200);
    assert.equal((await f.login('A changed password 123!')).status,200);
    assert.equal((await f.login(f.password)).status,401);
    assert.equal(f.row().failedSignIns,1);
  }finally{f.database.close();}
});

test('owner deletion is explicit, single use, and removes account credentials and sessions',async()=>{
  const f=await fixture();try{
    await f.lock();const links=f.alerts.at(-1).links;
    assert.equal((await f.act(links.delete)).status,200);assert.equal(f.row(),undefined);
    assert.equal(f.database.prepare('SELECT count(*) AS n FROM account').get().n,0);
    assert.equal(f.database.prepare('SELECT count(*) AS n FROM session').get().n,0);
    assert.equal((await f.act(links.unlock)).status,400);
  }finally{f.database.close();}
});
