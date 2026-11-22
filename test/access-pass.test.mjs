import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {getMigrations} from 'better-auth/db/migration';
import {decodeJwt} from 'jose';
import {createAuth} from '../server/auth.mjs';
import {loadConfig} from '../server/config.mjs';
import {createBrowserAPI} from '../server/browser-api.mjs';
import {createKingAuthVerifier} from '../packages/king-auth/verifier.mjs';
import {createBrowserClient} from '../packages/king-auth/browser.mjs';

async function fixture(){
  const database=new DatabaseSync(':memory:'),sent=[];
  const config=loadConfig({AUTH_BASE_URL:'http://localhost:3000',SIGNUP_APPROVAL_REQUIRED:'false'});
  const auth=createAuth({config,database,sender:{emailEnabled:true,smsEnabled:false,email:async value=>sent.push(value)}});
  await(await getMigrations(auth.options)).runMigrations();
  const api=createBrowserAPI({auth,config}),origin='https://music.example',base=config.baseURL+'/api/browser';
  const request=(route,body,token,site=origin)=>api(new Request(base+'/'+route,{method:body===undefined?'GET':'POST',headers:{Origin:site,'x-king-auth-client-ip':'192.0.2.1',...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)}));
  const user={name:'Listener',email:'listener@example.test',password:'Listener password 123!'};
  assert.equal((await request('sign-up/email',{...user,rememberMe:true})).status,200);
  const verified=await request('email-otp/verify-email',{email:user.email,otp:sent.at(-1).otp,rememberMe:true});
  assert.equal(verified.status,200);const login=await verified.json();
  return {database,auth,config,origin,base,request,user,login};
}
const bearer=token=>new Request('https://music.example/private',{headers:{Authorization:'Bearer '+token}});

function storage(){
  const descriptors=['localStorage','sessionStorage'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]);
  for(const [name] of descriptors){const values=new Map();Object.defineProperty(globalThis,name,{configurable:true,value:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}});}
  return ()=>{for(const [name,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}};
}

test('access passes verify locally, are origin scoped, and cannot renew or confirm passwords',async()=>{
  const f=await fixture();let keyRequests=0;
  try{
    const {accessPass,browserSession}=f.login;assert.ok(accessPass.token);const claims=decodeJwt(accessPass.token);
    assert.equal(claims.exp-claims.iat,1800);assert.equal(claims.aud,f.origin);
    assert.ok(Date.parse(browserSession.expiresAt)>Date.now()+1094*86400000);
    assert.equal(JSON.stringify(claims).includes(browserSession.token),false);
    const options={origin:f.origin,apiUrl:f.base,allowLocalhost:true,verification:'access-pass',fetch:async(url,init)=>{
      keyRequests++;assert.equal(url,f.base+'/jwks');assert.equal(init.redirect,'manual');
      return f.request('jwks');
    }};
    const verifier=createKingAuthVerifier(options);
    for(let i=0;i<20;i++)assert.equal((await verifier.getSession(bearer(accessPass.token))).user.id,claims.sub);
    assert.equal(keyRequests,1);
    assert.equal(await verifier.getSession(bearer(browserSession.token)),null);
    assert.equal(await createKingAuthVerifier({...options,origin:'https://other.example'}).getSession(bearer(accessPass.token)),null);
    const parts=accessPass.token.split('.');parts[1]=Buffer.from(JSON.stringify({...claims,sub:'attacker'})).toString('base64url');
    assert.equal(await verifier.getSession(bearer(parts.join('.'))),null);
    for(const patch of [{exp:claims.iat-1},{iss:'https://evil.example'},{kind:'oauth'},{sid:'other'},{exp:claims.iat+1801},{user:{...claims.user,emailVerified:false}}]){
      const {token}=await f.auth.api.signJWT({body:{payload:{...claims,...patch}}});
      assert.equal(await verifier.getSession(bearer(token)),null,JSON.stringify(patch));
    }
    assert.equal(await(await f.request('access-pass',undefined,accessPass.token)).json(),null);
    assert.equal((await f.request('reauthenticate',{password:f.user.password,action:'settings:change'},accessPass.token)).status,401);
    assert.equal((await f.request('reauthenticate',{password:f.user.password,action:'settings:change'},browserSession.token)).status,200);
    assert.equal((await f.request('sign-out',{},browserSession.token)).status,200);
    assert.equal(await(await f.request('access-pass',undefined,browserSession.token)).json(),null);
    // Explicit offline revocation window: issued passes remain valid until expiry.
    assert.ok(await verifier.getSession(bearer(accessPass.token)));
  }finally{f.database.close();}
});

test('access pass expires no later than the remembered session',async()=>{
  const f=await fixture();try{
    const shortened=await f.request('account/session-duration',{seconds:60},f.login.browserSession.token);assert.equal(shortened.status,200);
    const result=await(await f.request('access-pass',undefined,f.login.browserSession.token)).json();
    const claims=decodeJwt(result.accessPass.token);
    assert.ok(claims.exp-claims.iat<=60);assert.ok(claims.exp<=Math.floor(Date.parse(result.session.expiresAt)/1000));
    assert.equal(await(await f.request('access-pass',undefined,f.login.browserSession.token,'https://other.example')).json(),null);
    assert.equal(await(await f.request('access-pass')).json(),null);
  }finally{f.database.close();}
});

test('SDK uses startup pass, coalesces demand renewal, preserves persistence and stops after signout',async()=>{
  const restore=storage(),f=await fixture();let calls=0;
  const client=createBrowserClient({apiUrl:f.base,fetch:async(url,init)=>{calls++;return f.request(url.slice(f.base.length+1),init.body===undefined?undefined:JSON.parse(init.body),init.headers.Authorization?.slice(7));}});
  try{
    await client.request('sign-in/email',{email:f.user.email,password:f.user.password,rememberMe:true});
    calls=0;const pass=await client.getAccessToken();assert.ok(pass);assert.equal(calls,0);
    assert.equal(localStorage.getItem('king-auth:browser:'+f.base).includes(pass),false);
    const fresh=createBrowserClient({apiUrl:f.base,fetch:async(url,init)=>{calls++;return f.request(url.slice(f.base.length+1),undefined,init.headers.Authorization?.slice(7));}});
    await fresh.getSession();assert.equal(calls,1);assert.ok(await fresh.getAccessToken());assert.equal(calls,1);
    const restarted=createBrowserClient({apiUrl:f.base,fetch:async(url,init)=>{calls++;return f.request('access-pass',undefined,init.headers.Authorization?.slice(7));}});
    const renewed=await Promise.all(Array.from({length:20},()=>restarted.getAccessToken()));assert.equal(new Set(renewed).size,1);assert.equal(calls,2);
    await client.signOut();assert.equal(await restarted.getAccessToken(),null);
  }finally{restore();f.database.close();}
});

test('demand renewal respects Retry-After without deleting the saved login or retrying in a loop',async()=>{
  const restore=storage();let calls=0;const base='https://kingauth.app/api/browser';
  localStorage.setItem('king-auth:browser:'+base,JSON.stringify({token:'saved',remember:true,expiresAt:new Date(Date.now()+86400000).toISOString()}));
  const client=createBrowserClient({fetch:async()=>{calls++;return Response.json({message:'Wait'},{status:429,headers:{'Retry-After':'60'}});}});
  try{
    for(let i=0;i<5;i++)await assert.rejects(client.getAccessToken(),e=>e.status===429&&e.retryAfter==='60');
    assert.equal(calls,1);assert.equal(client.getToken(),'saved');
  }finally{restore();}
});

test('expired passes renew only on demand and late renewal cannot restore signed-out credentials',async()=>{
  const restore=storage(),originalNow=Date.now;let now=originalNow(),calls=0,release;
  Date.now=()=>now;
  const base='https://kingauth.app/api/browser',key='king-auth:browser:'+base;
  localStorage.setItem(key,JSON.stringify({token:'saved',remember:true,expiresAt:new Date(now+86400000).toISOString()}));
  const result=()=>({user:{id:'u'},session:{id:'s',expiresAt:new Date(now+86400000).toISOString()},accessPass:{token:'pass-'+calls,expiresAt:new Date(now+1800000).toISOString()}});
  const client=createBrowserClient({fetch:async(url)=>{calls++;if(url.endsWith('/sign-out'))return Response.json({});return Response.json(result());}});
  try{
    const first=await client.getAccessToken();assert.equal(calls,1);
    now+=1800001;assert.equal(calls,1); // elapsed time alone starts no network work
    const passes=await Promise.all(Array.from({length:10},()=>client.getAccessToken()));
    assert.equal(calls,2);assert.ok(passes.every(token=>token===passes[0]&&token!==first));
    const late=createBrowserClient({fetch:()=>new Promise(resolve=>{release=()=>resolve(Response.json(result()));})});
    const pending=late.getAccessToken();await client.signOut();release();
    assert.equal(await pending,null);assert.equal(localStorage.getItem(key),undefined);assert.equal(late.getToken(),null);
  }finally{Date.now=originalNow;restore();}
});

test('missing signing keys and JWKS outages deny access without a central-verification fallback',async()=>{
  const f=await fixture();try{
    let calls=0;const verifier=createKingAuthVerifier({origin:f.origin,apiUrl:f.base,verification:'access-pass',allowLocalhost:true,fetch:async url=>{calls++;assert.equal(url,f.base+'/jwks');return new Response(null,{status:503});}});
    await assert.rejects(verifier.getSession(bearer(f.login.accessPass.token)),/verification unavailable/);assert.equal(calls,1);
    const missing=createKingAuthVerifier({origin:f.origin,apiUrl:f.base,verification:'access-pass',allowLocalhost:true,fetch:async()=>Response.json({keys:[]})});
    assert.equal(await missing.getSession(bearer(f.login.accessPass.token)),null);
  }finally{f.database.close();}
});
