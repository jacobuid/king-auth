import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {getMigrations} from 'better-auth/db/migration';
import {createAuth} from '../server/auth.mjs';
import {loadConfig} from '../server/config.mjs';
import {createBrowserAPI} from '../server/browser-api.mjs';
import {createKingAuthVerifier} from '../packages/king-auth/server.mjs';

async function fixture({approval=false,locateSession}={}){
  const database=new DatabaseSync(':memory:');const sent=[],reviews=[];
  const config=loadConfig({AUTH_BASE_URL:'http://localhost:3000',SIGNUP_APPROVAL_REQUIRED:String(approval)});
  const auth=createAuth({config,database,locateSession,sender:{emailEnabled:true,smsEnabled:false,email:async data=>sent.push(data),signupRequest:async data=>reviews.push(data)}});
  await(await getMigrations(auth.options)).runMigrations();const api=createBrowserAPI({auth,config});
  const request=(route,body,{origin='https://family.example',token,headers={},method=body===undefined?'GET':'POST'}={})=>api(new Request(config.baseURL+'/api/browser/'+route,{method,headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)}));
  const user={name:'Family',email:'browser@example.test',password:'Browser password 123!'};
  async function signup(origin='https://family.example',rememberMe=true){
    let response=await request('sign-up/email',{...user,rememberMe},{origin});assert.equal(response.status,200,await response.text());
    response=await request('email-otp/verify-email',{email:user.email,otp:sent.at(-1).otp,rememberMe},{origin});assert.equal(response.status,200);return response.json();
  }
  return {database,auth,config,sent,reviews,api,request,user,signup};
}

test('browser API supports arbitrary HTTPS sites, ignores cookies and enforces site-bound bearer sessions',async()=>{
  const f=await fixture();try{
    const signup=await f.signup();const token=signup.browserSession.token;assert.ok(token.includes('.'));assert.equal(signup.token,undefined);
    assert.ok(new Date(signup.browserSession.expiresAt)-Date.now()>1094*86400000);
    const response=await f.request('get-session',undefined,{token});assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'*');assert.equal(response.headers.has('access-control-allow-credentials'),false);assert.equal(response.headers.has('set-cookie'),false);
    const session=await response.json();assert.match(session.user.id,/^[0-9a-f-]{36}$/);assert.equal(session.session.token,undefined);
    const legacy=await f.auth.handler(new Request(f.config.baseURL+'/api/auth/get-session',{headers:{Origin:f.config.baseURL,Authorization:'Bearer '+token}}));assert.equal(legacy.status,401);
    const escaped=await f.auth.handler(new Request(f.config.baseURL+'/api/auth/update-user',{method:'POST',headers:{Origin:f.config.baseURL,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({name:'Scope escape'})}));assert.equal(escaped.status,401);
    assert.equal(await(await f.request('get-session')).json(),null);
    assert.equal(await(await f.request('get-session',undefined,{token,origin:'https://second.example'})).json(),null);
    assert.equal((await f.request('update-user',{name:'Intruder'},{token,origin:'https://second.example'})).status,401);
    const second=await f.request('sign-in/email',{email:f.user.email,password:f.user.password,rememberMe:true},{origin:'https://second.example'});assert.equal(second.status,200);const secondToken=(await second.json()).browserSession.token;
    const secondSession=await(await f.request('get-session',undefined,{token:secondToken,origin:'https://second.example'})).json();assert.equal(secondSession.user.id,session.user.id);assert.notEqual(secondSession.session.id,session.session.id);
    assert.equal((await f.request('oauth2/create-client',{})).status,404);assert.equal((await f.request('account-security',{})).status,404);
    const raw=await f.auth.handler(new Request(f.config.baseURL+'/api/auth/sign-in/email',{method:'POST',headers:{Origin:f.config.baseURL,'Content-Type':'application/json'},body:JSON.stringify({email:f.user.email,password:f.user.password})}));
    const cookies=raw.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    assert.equal(await(await f.request('get-session',undefined,{headers:{Cookie:cookies}})).json(),null);
    assert.equal((await f.request('sign-out',{}, {token})).status,200);assert.equal(await(await f.request('get-session',undefined,{token})).json(),null);
    assert.ok((await(await f.request('get-session',undefined,{token:secondToken,origin:'https://second.example'})).json()).user);
  }finally{f.database.close();}
});

test('browser preflight and request guards reject unsafe origins, headers, methods, bodies and honeypots',async()=>{
  const f=await fixture();try{
    const response=await f.request('sign-in/email',undefined,{method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});assert.equal(response.status,204);
    assert.equal((await f.request('sign-in/email',undefined,{method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'cookie'}})).status,403);
    for(const origin of ['null','http://unsafe.example','https://family.example/path'])assert.equal((await f.request('get-session',undefined,{origin})).status,403);
    assert.equal((await f.request('get-session',undefined,{origin:'http://localhost:5173'})).status,200);
    assert.equal((await f.request('get-session',{})).status,405);
    assert.equal((await f.request('sign-up/email',{...f.user,website:'bot'})).status,400);assert.equal(f.sent.length,0);
    assert.equal((await f.request('sign-up/email',{...f.user,name:'x'.repeat(17000)})).status,413);
  }finally{f.database.close();}
});

test('browser duration, backend verifier and revocation preserve central policy',async()=>{
  const f=await fixture();try{
    const data=await f.signup('https://family.example',false);const token=data.browserSession.token;
    assert.ok(new Date(data.browserSession.expiresAt)-Date.now()<86400001);
    const verifier=createKingAuthVerifier({origin:'https://family.example',apiUrl:f.config.baseURL+'/api/browser',allowLocalhost:true,fetch:(url,options)=>f.api(new Request(url,options))});
    const req=new Request('https://family.example/private',{headers:{Authorization:'Bearer '+token}});
    assert.ok(await verifier.isSignedIn(req));
    let response=await f.request('account/session-duration',{seconds:94608000,persistent:true},{token});assert.equal(response.status,200);
    assert.ok(new Date((await response.json()).expiresAt)-Date.now()>1094*86400000);
    assert.equal((await f.request('account/session-duration',{seconds:94608001},{token})).status,400);
    const listed=await(await f.request('account/sessions',undefined,{token})).json();assert.equal(listed[0].token,undefined);
    await f.request('account/revoke-session',{sessionId:listed[0].id},{token});assert.equal(await verifier.getSession(req),null);
  }finally{f.database.close();}
});

test('browser signup keeps owner approval gate and hides review secrets',async()=>{
  const f=await fixture({approval:true});try{
    const signup=await f.signup();assert.equal(signup.user.approvalStatus,'pending');assert.equal(signup.browserSession,undefined);assert.equal(signup.user.approvalApproveHash,undefined);assert.equal(f.reviews[0].ownerEmail,'jacobuid@gmail.com');
    assert.equal((await f.request('sign-in/email',{email:f.user.email,password:f.user.password})).status,403);
  }finally{f.database.close();}
});

test('account sessions identify each app and device across sites and preserve revocation',async()=>{
  const location={city:'Tyler',region:'Texas',regionCode:'TX',countryCode:'US',label:'Tyler, TX'};
  const f=await fixture({locateSession:async()=>location});try{
    const first=(await f.signup('https://king-sports.example')).browserSession.token;
    const signedIn=await f.request('sign-in/email',{email:f.user.email,password:f.user.password,rememberMe:true},{origin:'https://other-app.example',headers:{'User-Agent':'Mozilla/5.0 (iPhone) Mobile'}});
    assert.equal(signedIn.status,200);
    const second=(await signedIn.json()).browserSession.token;
    const response=await f.request('account/sessions',undefined,{origin:'https://king-sports.example',token:first});
    assert.equal(response.status,200);
    const sessions=await response.json();assert.equal(sessions.length,2);
    const current=sessions.find(item=>item.current),other=sessions.find(item=>!item.current);
    assert.equal(current.appName,'King Sports');assert.equal(current.appOrigin,'https://king-sports.example');
    assert.equal(other.appName,'Other App');assert.equal(other.appOrigin,'https://other-app.example');assert.equal(other.device,'Phone');
    for(const item of sessions){assert.ok(item.expiresAt);assert.equal(item.token,undefined);assert.equal(item.ipAddress,undefined);assert.deepEqual(item.location,location);}
    assert.equal((await f.request('account/revoke-session',{sessionId:other.id},{origin:'https://king-sports.example',token:first})).status,200);
    assert.equal(await(await f.request('get-session',undefined,{origin:'https://other-app.example',token:second})).json(),null);
    assert.ok((await(await f.request('get-session',undefined,{origin:'https://king-sports.example',token:first})).json()).user);
  }finally{f.database.close();}
});

test('GitHub Pages sessions retain distinct app paths, names and PWA modes on the same origin',async()=>{
  const f=await fixture();try{
    const origin='https://jacobuid.github.io';await f.signup(origin);
    const apps=[{path:'/king-sports/',displayMode:'standalone'},{path:'/king-comics/',displayMode:'browser',deviceHints:{multiTouch:true}},{path:'/king-videos/',name:'Kingflix',displayMode:'standalone'}];
    let token;
    for(const app of apps){
      const response=await f.request('sign-in/email',{email:f.user.email,password:f.user.password,app},{origin,headers:{'User-Agent':app.deviceHints?'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1':'Mozilla/5.0 (iPhone) Mobile','x-king-auth-app':encodeURIComponent(JSON.stringify({path:'/spoof/'}))}});
      assert.equal(response.status,200,await response.clone().text());token=(await response.json()).browserSession.token;
    }
    const response=await f.request('account/sessions',undefined,{origin,token});assert.equal(response.status,200);
    const sessions=await response.json();assert.equal(sessions.length,4);
    for(const [index,app] of apps.entries()){
      const session=sessions.find(item=>item.appPath===app.path);
      assert.ok(session);assert.equal(session.appOrigin,origin);assert.equal(session.appName,['King Sports','King Comics','Kingflix'][index]);
      assert.equal(session.device,index===1?'Tablet':'Phone');assert.equal(session.deviceName,index===1?'iPad':'iPhone');assert.equal(session.appType,app.displayMode==='standalone'?'PWA':'Browser');
      assert.equal(session.token,undefined);
    }
    const legacy=sessions.find(item=>item.appPath===null);assert.ok(legacy);assert.equal(legacy.appType,null);
    const current=sessions.find(item=>item.current);assert.equal(current.appName,'Kingflix');
    const revoked=sessions.find(item=>item.appPath==='/king-sports/');
    assert.equal((await f.request('account/revoke-session',{sessionId:revoked.id},{origin,token})).status,200);
    const remaining=await(await f.request('account/sessions',undefined,{origin,token})).json();assert.equal(remaining.length,3);
  }finally{f.database.close();}
});

test('invalid app metadata is rejected before issuing a session',async()=>{
  const f=await fixture();try{
    for(const app of [{path:'//evil.example/'},{path:'/king-sports/?token=secret'},{name:'x'.repeat(81)},{displayMode:'native'}]){
      assert.equal((await f.request('sign-up/email',{...f.user,app})).status,400);
    }
    assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM session').get().count,0);
    assert.equal(f.sent.length,0);
  }finally{f.database.close();}
});
