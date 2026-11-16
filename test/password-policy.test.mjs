import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {getMigrations} from 'better-auth/db/migration';
import {createAuth} from '../server/auth.mjs';
import {loadConfig} from '../server/config.mjs';
import {validNewPassword} from '../packages/king-auth/password-policy.mjs';

test('password policy requires 8 characters and all four character categories',()=>{
  for(const value of ['Abc12!x','abcd12!x','ABCD12!X','Abcdef!x','Abcdef12','Abcdef1 ','Abcdef1é','A1!'+ 'a'.repeat(126)])assert.equal(validNewPassword(value),false);
  for(const value of ['Abcd12!x','New12!ab','Abcd12💡x'])assert.equal(validNewPassword(value),true);
});

test('all credential creation paths reject weak passwords; 8-character signup, change and reset work',async()=>{
  const database=new DatabaseSync(':memory:'),sent=[];let cookie='',ip=0;
  const config=loadConfig({AUTH_BASE_URL:'http://localhost:3000',SIGNUP_APPROVAL_REQUIRED:'false'});
  const auth=createAuth({config,database,sender:{emailEnabled:true,smsEnabled:true,email:async data=>sent.push(data),sms:async()=>{}}});
  await(await getMigrations(auth.options)).runMigrations();
  async function post(path,body){
    const response=await auth.handler(new Request(config.baseURL+'/api/auth'+path,{method:'POST',headers:{Origin:config.baseURL,'Content-Type':'application/json','x-king-auth-client-ip':'192.0.2.'+(++ip),...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)}));
    const cookies=response.headers.getSetCookie();if(cookies.length)cookie=cookies.map(item=>item.split(';')[0]).join('; ');
    return {status:response.status,data:await response.json()};
  }
  try{
    for(const [path,field] of [['/sign-up/email','password'],['/change-password','newPassword'],['/reset-password','newPassword'],['/email-otp/reset-password','password'],['/phone-number/reset-password','newPassword']]){
      const result=await post(path,{[field]:'abcdefgh'});assert.equal(result.status,400);assert.equal(result.data.code,'PASSWORD_POLICY',path);
    }
    for(const password of ['abcd12!x','ABCD12!X','Abcdef!x','Abcdef12']){
      const result=await post('/sign-up/email',{name:'Test',email:'policy@example.test',password});assert.equal(result.data.code,'PASSWORD_POLICY');
    }
    assert.equal(sent.length,0);
    const signup=await post('/sign-up/email',{name:'Test',email:'policy@example.test',password:'Abcd12!x'});assert.equal(signup.status,200);
    assert.equal((await post('/email-otp/verify-email',{email:'policy@example.test',otp:sent.at(-1).otp})).status,200);
    assert.equal((await post('/change-password',{currentPassword:'Abcd12!x',newPassword:'New12!ab'})).status,200);
    await post('/email-otp/request-password-reset',{email:'policy@example.test'});const otp=sent.at(-1).otp;
    assert.equal((await post('/email-otp/reset-password',{email:'policy@example.test',otp,password:'abcdefgh'})).data.code,'PASSWORD_POLICY');
    assert.equal((await post('/email-otp/reset-password',{email:'policy@example.test',otp,password:'Reset1!x'})).status,200);
    assert.equal((await post('/sign-in/email',{email:'policy@example.test',password:'Reset1!x'})).status,200);
  }finally{database.close();}
});
