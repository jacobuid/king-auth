import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {getMigrations} from 'better-auth/db/migration';
import {createAuth} from '../server/auth.mjs';
import {loadConfig} from '../server/config.mjs';

async function fixture(){
  const database=new DatabaseSync(':memory:');const sent=[],reviews=[];
  const config=loadConfig({AUTH_BASE_URL:'http://localhost:3000'});
  const auth=createAuth({config,database,sender:{emailEnabled:true,smsEnabled:false,email:async data=>sent.push(data),signupRequest:async data=>reviews.push(data)}});
  await(await getMigrations(auth.options)).runMigrations();
  async function request(path,body,form=false){
    const response=await auth.handler(new Request(config.baseURL+path,{method:body===undefined?'GET':'POST',headers:{Origin:config.baseURL,'x-king-auth-client-ip':'127.0.0.1',...(body===undefined?{}:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'})},body:body===undefined?undefined:form?new URLSearchParams(body):JSON.stringify(body)}));
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:response.status,data,headers:response.headers};
  }
  const signup=async(email='new@example.test',extra={})=>request('/api/auth/sign-up/email',{name:'New',email,password:'Signup password 123!',...extra});
  const decide=async url=>request('/api/auth/signup-review/confirm',Object.fromEntries(new URL(url).searchParams),true);
  return {database,sent,reviews,request,signup,decide};
}

test('owner approval gates verified accounts; scanner GET, token secrecy, replay and decision binding',async()=>{
  const f=await fixture();try{
    const signup=await f.signup('new@example.test',{approvalStatus:'approved'});assert.equal(signup.status,200,JSON.stringify(signup.data));assert.equal(signup.data.user.approvalStatus,'pending');
    assert.equal(signup.data.user.approvalApproveHash,undefined);assert.equal(f.reviews.length,1);assert.equal(f.reviews[0].ownerEmail,'jacobuid@gmail.com');
    const verified=await f.request('/api/auth/email-otp/verify-email',{email:'new@example.test',otp:f.sent.at(-1).otp});assert.equal(verified.status,200);assert.equal(verified.data.token,null);
    const login=()=>f.request('/api/auth/sign-in/email',{email:'new@example.test',password:'Signup password 123!'});
    assert.equal((await login()).status,403);
    const link=new URL(f.reviews[0].approveURL);
    const preview=await f.request(link.pathname+link.search);assert.equal(preview.status,200);assert.match(preview.data,/Confirm signup decision/);
    assert.equal((await login()).status,403);
    const swapped=new URL(link);swapped.searchParams.set('decision','deny');assert.equal((await f.decide(swapped)).status,400);
    assert.equal((await f.decide(link)).status,200);assert.equal((await login()).status,200);
    assert.equal((await f.decide(link)).status,400);assert.equal((await f.decide(f.reviews[0].denyURL)).status,400);
    const saved=f.database.prepare('SELECT approvalApproveHash,approvalDenyHash FROM user WHERE id=?').get(signup.data.user.id);assert.equal(saved.approvalApproveHash,null);assert.equal(saved.approvalDenyHash,null);
  }finally{f.database.close();}
});

test('denied/expired requests cannot sign in; honeypot blocks before creating users or sending email',async()=>{
  const f=await fixture();try{
    const bot=await f.signup('bot@example.test',{website:'https://spam.example'});assert.equal(bot.status,400);assert.equal(f.reviews.length,0);assert.equal(f.sent.length,0);assert.equal(f.database.prepare('SELECT count(*) AS total FROM user').get().total,0);
    assert.equal((await f.signup()).status,200);assert.equal((await f.decide(f.reviews[0].denyURL)).status,200);
    await f.request('/api/auth/email-otp/verify-email',{email:'new@example.test',otp:f.sent.at(-1).otp});
    assert.equal((await f.request('/api/auth/sign-in/email',{email:'new@example.test',password:'Signup password 123!'})).status,403);
    assert.equal((await f.decide(f.reviews[0].approveURL)).status,400);
    assert.equal((await f.signup('expired@example.test')).status,200);
    f.database.prepare('UPDATE user SET approvalExpiresAt=? WHERE email=?').run(Date.now()-1000,'expired@example.test');
    assert.equal((await f.decide(f.reviews[1].approveURL)).status,400);
  }finally{f.database.close();}
});

test('additive upgrade preserves existing accounts and initializes approval/security defaults',async()=>{
  const f=await fixture();try{
    const result=await f.signup();assert.equal(result.status,200);
    const columns=['approvalStatus','approvalApproveHash','approvalDenyHash','approvalExpiresAt','failedSignIns','signInLocked','lockReview','lockReviewExpiresAt','loginCodeSentAt'];
    for(const column of columns)f.database.exec('ALTER TABLE user DROP COLUMN '+column);
    const auth=createAuth({config:loadConfig({AUTH_BASE_URL:'http://localhost:3000'}),database:f.database,sender:{emailEnabled:true,smsEnabled:false}});
    await(await getMigrations(auth.options)).runMigrations();
    const row=f.database.prepare('SELECT approvalStatus,failedSignIns,signInLocked FROM user WHERE id=?').get(result.data.user.id);
    assert.equal(row.approvalStatus,'approved');assert.equal(row.failedSignIns,0);assert.equal(row.signInLocked,0);
    assert.equal((await getMigrations(auth.options)).toBeAdded.length,0);
  }finally{f.database.close();}
});
