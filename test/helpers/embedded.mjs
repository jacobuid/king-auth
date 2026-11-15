
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import http from 'node:http';
import {getMigrations} from 'better-auth/db/migration';
import {createAuth} from '../../server/auth.mjs';
import {loadConfig} from '../../server/config.mjs';
import {createKingAuthServer} from '../../packages/king-auth/server.mjs';

export async function embeddedFixture(extraHandler,{approval=false}={}){
  const database=new DatabaseSync(':memory:');const sent=[],reviews=[];
  const config=loadConfig({AUTH_BASE_URL:'http://localhost:3000',SIGNUP_APPROVAL_REQUIRED:String(approval)});
  const auth=createAuth({config,database,sender:{emailEnabled:true,smsEnabled:false,email:async data=>sent.push(data),signupRequest:async data=>reviews.push(data),sms:async()=>{throw Error('No SMS');}}});
  await(await getMigrations(auth.options)).runMigrations();
  let requests=0;
  let adapter;
  const server=http.createServer((req,res)=>{if(extraHandler?.(req,res))return;adapter.handler(req,res,async()=>{try{const session=await adapter.getSession(req,res);res.writeHead(session?200:401,{'Content-Type':'application/json'});res.end(JSON.stringify(session?{userId:session.user.id}:null));}catch{res.writeHead(503);res.end();}});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;let cookie='';
  adapter=createKingAuthServer({origin:url,secret:'integration-test-secret-only-'.repeat(3),issuer:'http://localhost:3000/api/auth',allowLocalhost:true,fetch:async(url,options)=>{
    requests++;return auth.handler(new Request(url,{...options,headers:{...options.headers,'x-king-auth-client-ip':'127.0.0.1'}}));
  }});
  async function request(route,body,headers={}){
    const response=await fetch(url+(route.startsWith('/')?route:'/auth/api/'+route),{method:body===undefined?'GET':'POST',headers:{Origin:url,...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const setCookie=response.headers.getSetCookie();if(setCookie.length)cookie=setCookie.at(-1).split(';')[0];
    let data;try{data=await response.json();}catch{data=null;}
    return {status:response.status,data,headers:response.headers};
  }
  const user={email:'email-only@example.test',password:'Integration password 123!',name:'Email only'};
  async function signup(rememberMe=false){
    const result=await request('sign-up/email',{...user,rememberMe});assert.equal(result.status,200,JSON.stringify(result.data));
    assert.equal(result.data.token,undefined);
    assert.equal((await request('get-session')).data,null);
    const verified=await request('email-otp/verify-email',{email:user.email,otp:sent.at(-1).otp});assert.equal(verified.status,200,JSON.stringify(verified.data));return result.data.user.id;
  }
  return {auth,database,sent,reviews,adapter,server,url,user,request,signup,getCookie:()=>cookie,setCookie:value=>{cookie=value;},getRequests:()=>requests,close:async()=>{await new Promise(resolve=>server.close(resolve));database.close();}};
}
