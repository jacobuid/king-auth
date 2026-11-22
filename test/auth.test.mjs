import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { getMigrations } from 'better-auth/db/migration';
import { jwtVerify, createLocalJWKSet } from 'jose';
import { createAuth } from '../server/auth.mjs';
import { loadConfig } from '../server/config.mjs';
import http from 'node:http';
import { toNodeHandler } from 'better-auth/node';
import { createKingAuth } from '../packages/king-auth/server.mjs';

async function fixture(baseURL='http://localhost:3000') {
  const config=loadConfig({AUTH_BASE_URL:baseURL,SIGNUP_APPROVAL_REQUIRED:'false'});
  const database=new DatabaseSync(':memory:');
  const sent=[];const sms=[];
  const sender={emailEnabled:true,smsEnabled:true,email:async data=>sent.push(data),sms:async data=>sms.push(data)};
  const auth=createAuth({config,database,sender});
  await (await getMigrations(auth.options)).runMigrations();
  let cookie='';
  async function request(path,body,options={}) {
    const headers={Origin:config.baseURL,'x-king-auth-client-ip':'127.0.0.1',...options.headers};
    if(!options.noCookie && cookie)headers.Cookie=cookie;
    if(body!==undefined)headers['Content-Type']=options.form ? 'application/x-www-form-urlencoded':'application/json';
    const response=await auth.handler(new Request(config.baseURL+'/api/auth'+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:options.form?new URLSearchParams(body):JSON.stringify(body)}));
    if(!options.noCookie){const cookies=response.headers.getSetCookie();if(cookies.length) cookie=cookies.map(s=>s.split(';')[0]).join('; ');}
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
    return {status:response.status,data,headers:response.headers};
  }
  async function verifiedUser() {
    const data={name:'Alex Test',email:'alex@example.test',username:'alex_test',password:'A very long test password 1!'};
    const signup=await request('/sign-up/email',data);assert.equal(signup.status,200,JSON.stringify(signup.data));
    const otp=sent.at(-1).otp;
    const verified=await request('/email-otp/verify-email',{email:data.email,otp});assert.equal(verified.status,200,JSON.stringify(verified.data));
    return { ...data, id:signup.data.user.id };
  }
  return {auth,config,database,sent,sms,sender,request,verifiedUser,getCookie:()=>cookie};
}

test('verified identity, mutable username, code replay protection, and CSRF',async()=>{
  const f=await fixture();
  try{
    const signup=await f.request('/sign-up/email',{name:'Alex',email:'alex@example.test',username:'alex_test',password:'A very long test password 1!'});
    assert.equal(signup.status,200,JSON.stringify(signup.data));
    const id=signup.data.user.id;assert.match(id,/^[0-9a-f-]{36}$/);
    const unverified=await f.request('/sign-in/username',{username:'alex_test',password:'A very long test password 1!'});assert.equal(unverified.status,403);
    const otp=f.sent.at(-1).otp;
    const verified=await f.request('/email-otp/verify-email',{email:'alex@example.test',otp});assert.equal(verified.status,200,JSON.stringify(verified.data));
    assert.equal((await f.request('/email-otp/verify-email',{email:'alex@example.test',otp})).status,400);
    assert.equal((await f.request('/update-user',{username:'alex_changed'})).status,200);
    const session=await f.request('/get-session');assert.equal(session.data.user.id,id);assert.equal(session.data.user.username,'alex_changed');
    assert.equal((await f.request('/update-user',{name:'Attacker'},{headers:{Origin:'https://evil.example'}})).status,403);
    assert.ok([401,403].includes((await f.request('/oauth2/create-client',{client_name:'Unauthorized',redirect_uris:['https://evil.example/cb']})).status));
  }finally{f.database.close();}
});

test('email changes require proof of both addresses and preserve the user ID',async()=>{
  const f=await fixture();try{
    const user=await f.verifiedUser();
    assert.notEqual((await f.request('/email-otp/request-email-change',{newEmail:'new@example.test'})).status,200);
    await f.request('/email-otp/send-verification-otp',{email:user.email,type:'email-verification'});
    const oldCode=f.sent.at(-1).otp;
    const requested=await f.request('/email-otp/request-email-change',{newEmail:'new@example.test',otp:oldCode});assert.equal(requested.status,200,JSON.stringify(requested.data));
    const changed=await f.request('/email-otp/change-email',{newEmail:'new@example.test',otp:f.sent.at(-1).otp});assert.equal(changed.status,200,JSON.stringify(changed.data));
    const session=await f.request('/get-session');assert.equal(session.data.user.email,'new@example.test');assert.equal(session.data.user.id,user.id);
  }finally{f.database.close();}
});

test('password reset consumes codes and revokes existing sessions',async()=>{
  const f=await fixture();try{
    const user=await f.verifiedUser();
    await f.request('/email-otp/request-password-reset',{email:user.email});
    const reset={email:user.email,otp:f.sent.at(-1).otp,password:'A replacement password 123!'};
    const response=await f.request('/email-otp/reset-password',reset);assert.equal(response.status,200,JSON.stringify(response.data));
    assert.equal((await f.request('/get-session')).data,null);
    assert.notEqual((await f.request('/email-otp/reset-password',reset)).status,200);
    assert.equal((await f.request('/sign-in/email',{email:user.email,password:reset.password})).status,200);
  }finally{f.database.close();}
});

test('OIDC authorization code + S256 PKCE, exact callbacks, consent, and token validation',async()=>{
  const f=await fixture();try{
    const user=await f.verifiedUser();f.config.adminIds.push(user.id);
    const registration=await f.request('/oauth2/create-client',{client_name:'Test website',redirect_uris:['https://website.example/callback'],token_endpoint_auth_method:'none',scope:'openid profile email'});
    assert.equal(registration.status,201,JSON.stringify(registration.data));const client=registration.data;
    const verifier='a'.repeat(64);const challenge=createHash('sha256').update(verifier).digest('base64url');
    const params=new URLSearchParams({client_id:client.client_id,redirect_uri:'https://website.example/callback',response_type:'code',scope:'openid profile email',state:'state-123',nonce:'nonce-123',code_challenge:challenge,code_challenge_method:'S256'});
    const bad=new URLSearchParams(params);bad.set('redirect_uri','https://attacker.example/callback');
    const rejected=await f.request('/oauth2/authorize?'+bad);assert.ok(!String(rejected.headers.get('location')).startsWith('https://attacker.example'));
    const missing=new URLSearchParams(params);missing.delete('code_challenge');
    const noPKCE=await f.request('/oauth2/authorize?'+missing);assert.ok(noPKCE.status>=400 || !String(noPKCE.headers.get('location')).includes('code='));
    const authorized=await f.request('/oauth2/authorize?'+params);assert.equal(authorized.status,302,JSON.stringify(authorized.data));
    const consentURL=new URL(authorized.headers.get('location'),f.config.baseURL);assert.equal(consentURL.pathname,'/consent');
    const consent=await f.request('/oauth2/consent',{accept:true,oauth_query:consentURL.searchParams.toString()});assert.equal(consent.status,200,JSON.stringify(consent.data));
    const callback=new URL(consent.data.url);assert.equal(callback.origin,'https://website.example');assert.equal(callback.searchParams.get('state'),'state-123');
    const tokenRequest={grant_type:'authorization_code',client_id:client.client_id,redirect_uri:'https://website.example/callback',code:callback.searchParams.get('code'),code_verifier:verifier};
    const tokens=await f.request('/oauth2/token',tokenRequest,{form:true,noCookie:true});assert.equal(tokens.status,200,JSON.stringify(tokens.data));
    const keys=await f.request('/jwks');assert.equal(keys.status,200);
    const {payload}=await jwtVerify(tokens.data.id_token,createLocalJWKSet(keys.data),{issuer:f.config.baseURL+'/api/auth',audience:client.client_id});
    assert.equal(payload.sub,user.id);assert.equal(payload.nonce,'nonce-123');assert.equal(payload.email_verified,true);
    await assert.rejects(()=>jwtVerify(tokens.data.id_token,createLocalJWKSet(keys.data),{issuer:f.config.baseURL+'/api/auth',audience:'another-website'}));
    const info=await f.request('/oauth2/userinfo',undefined,{noCookie:true,headers:{Authorization:`Bearer ${tokens.data.access_token}`}});assert.equal(info.status,200);assert.equal(info.data.sub,user.id);
    assert.notEqual((await f.request('/oauth2/token',tokenRequest,{form:true,noCookie:true})).status,200);
  }finally{f.database.close();}
});

test('production refuses development secrets and non-HTTPS issuers',()=>{
  assert.throws(()=>loadConfig({NODE_ENV:'production',AUTH_BASE_URL:'http://example.com'}));
  assert.throws(()=>loadConfig({NODE_ENV:'production',AUTH_BASE_URL:'https://example.com'}));
});

test('verified phone changes preserve identity and cannot use an email code',async()=>{
  const f=await fixture();try{
    const user=await f.verifiedUser();
    await f.request('/phone-number/send-otp',{phoneNumber:'+15551234567'});
    const wrong=await f.request('/phone-number/verify',{phoneNumber:'+15551234567',code:'000000',updatePhoneNumber:true});assert.notEqual(wrong.status,200);
    const result=await f.request('/phone-number/verify',{phoneNumber:'+15551234567',code:f.sms.at(-1).code,updatePhoneNumber:true,disableSession:true});assert.equal(result.status,200,JSON.stringify(result.data));
    const session=await f.request('/get-session');assert.equal(session.data.user.id,user.id);assert.equal(session.data.user.phoneNumber,'+15551234567');assert.equal(session.data.user.phoneNumberVerified,true);
    assert.notEqual((await f.request('/update-user',{phoneNumber:'+15557654321'})).status,200);
  }finally{f.database.close();}
});

test('coarse login traffic limiting persists in the database',async()=>{
  const f=await fixture();try{
    for(let i=0;i<60;i++) await f.request('/sign-in/email',{email:'nobody@example.test',password:'An incorrect password!'});
    const limited=await f.request('/sign-in/email',{email:'nobody@example.test',password:'An incorrect password!'});assert.equal(limited.status,429);
  }finally{f.database.close();}
});

test('installable server helper validates an actual OIDC callback',async()=>{
  let handler;
  const server=http.createServer((req,res)=>handler(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseURL='http://127.0.0.1:'+server.address().port;
  const f=await fixture(baseURL);handler=toNodeHandler(f.auth);
  try{
    const user=await f.verifiedUser();f.config.adminIds.push(user.id);
    const registration=await f.request('/oauth2/create-client',{client_name:'SDK example',redirect_uris:['https://website.example/auth/callback'],token_endpoint_auth_method:'client_secret_basic',scope:'openid profile email'});
    assert.equal(registration.status,201,JSON.stringify(registration.data));
    const client=await createKingAuth({issuer:baseURL+'/api/auth',clientId:registration.data.client_id,clientSecret:registration.data.client_secret,redirectUri:'https://website.example/auth/callback',allowLocalhost:true});
    const {url,transaction}=await client.begin();
    const authorized=await f.request('/oauth2/authorize?'+new URL(url).searchParams);
    const consentURL=new URL(authorized.headers.get('location'),baseURL);
    const consent=await f.request('/oauth2/consent',{accept:true,oauth_query:consentURL.searchParams.toString()});assert.equal(consent.status,200,JSON.stringify(consent.data));
    await assert.rejects(()=>client.complete(consent.data.url,{...transaction,state:'attacker'}));
    const identity=await client.complete(consent.data.url,transaction);assert.equal(identity.id,user.id);assert.equal(identity.email,user.email);
    await assert.rejects(()=>client.complete(consent.data.url,transaction));
    await assert.rejects(()=>client.complete(consent.data.url,{...transaction,state:'attacker'}));
    await assert.rejects(()=>client.complete(consent.data.url,{...transaction,createdAt:0}));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));f.database.close();}
});


test('ten successful logins from one IP do not exhaust the failed-password budget',async()=>{
  const f=await fixture();try{
    const user=await f.verifiedUser();
    for(let i=0;i<10;i++){
      const result=await f.request('/sign-in/email',{email:user.email,password:user.password});
      assert.equal(result.status,200,JSON.stringify(result.data));
    }
    assert.equal(f.database.prepare('SELECT failedSignIns FROM user WHERE id=?').get(user.id).failedSignIns,0);
    assert.equal((await f.request('/sign-in/email',{email:user.email,password:'Wrong password 123!'})).status,401);
    assert.equal(f.database.prepare('SELECT failedSignIns FROM user WHERE id=?').get(user.id).failedSignIns,1);
  }finally{f.database.close();}
});
