import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserAppInfo,normalizeAppInfo} from '../packages/king-auth/app-info.mjs';
import {sessionDetails} from '../server/session-details.mjs';
import {createBrowserClient} from '../packages/king-auth/browser.mjs';

test('GitHub Pages apps retain the repository path and omit private deep links',()=>{
  for(const project of ['king-sports','king-comics','king-videos']){
    const location=new URL('https://jacobuid.github.io/'+project+'/account/private?token=secret#secret');
    assert.deepEqual(browserAppInfo({location,navigator:{},matchMedia:()=>({matches:false})}),{path:'/'+project+'/',displayMode:'browser',deviceHints:{multiTouch:false}});
  }
  assert.equal(browserAppInfo({location:new URL('https://sports.example/account/private')}).path,'/');
  assert.equal(browserAppInfo({location:new URL('https://jacobuid.github.io/king-videos/'),appName:'Kingflix'}).name,'Kingflix');
  assert.equal(browserAppInfo({location:undefined}),null);
});

test('iOS standalone and display-mode media queries identify PWA mode',()=>{
  const location=new URL('https://jacobuid.github.io/king-sports/');
  assert.equal(browserAppInfo({location,navigator:{standalone:true},matchMedia:()=>({matches:false})}).displayMode,'standalone');
  for(const mode of ['standalone','minimal-ui','window-controls-overlay']){
    assert.equal(browserAppInfo({location,navigator:{},matchMedia:query=>({matches:query==='(display-mode: '+mode+')'})}).displayMode,'standalone');
  }
  assert.equal(browserAppInfo({location,navigator:{},matchMedia:()=>({matches:false})}).displayMode,'browser');
});

test('app metadata rejects cross-origin paths, full URLs, secrets and invalid names/modes',()=>{
  for(const value of [{path:'//evil.example/'},{path:'https://evil.example/'},{path:'/app?token=secret'},{path:'/app#secret'},{path:'/\\evil.example/'},{name:'x'.repeat(81)},{name:'\nInvalid'},{name:42},{displayMode:'native'},[]]){
    assert.throws(()=>normalizeAppInfo('https://jacobuid.github.io',value));
  }
  assert.deepEqual(normalizeAppInfo('https://jacobuid.github.io',{path:'/king-videos/',name:'Kingflix',displayMode:'standalone'}),{path:'/king-videos/',name:'Kingflix',displayMode:'standalone'});
});

test('saved path and optional name identify project apps; old sessions retain unknown PWA mode',()=>{
  const details=sessionDetails({browserOrigin:'https://jacobuid.github.io',browserAppPath:'/king-sports/',browserDisplayMode:'standalone',userAgent:'Mozilla/5.0 (iPhone) Mobile'});
  assert.equal(details.appName,'King Sports');assert.equal(details.appPath,'/king-sports/');assert.equal(details.appType,'PWA');assert.equal(details.device,'Phone');
  assert.equal(sessionDetails({browserOrigin:'https://jacobuid.github.io',browserAppPath:'/king-videos/',browserAppName:'Kingflix',browserDisplayMode:'browser'}).appName,'Kingflix');
  assert.equal(sessionDetails({}).appType,null);
});

test('browser transport sends app metadata at sign-in and isolates storage between project apps',async t=>{
  const keys=['location','localStorage','sessionStorage','matchMedia'];
  const originals=keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
  t.after(()=>{for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  const storage=()=>{const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage()});
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:storage()});
  Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:query=>({matches:query==='(display-mode: standalone)'})});
  const received=[];
  const send=async(url,options)=>{received.push({url,body:options.body?JSON.parse(options.body):undefined});return Response.json({browserSession:{token:'credential-'+received.length,expiresAt:new Date(Date.now()+86400000).toISOString()}});};
  Object.defineProperty(globalThis,'location',{configurable:true,value:new URL('https://jacobuid.github.io/king-sports/private?secret=hidden')});
  const sports=createBrowserClient({fetch:send});await sports.request('sign-in/email',{email:'user@example.test',password:'password',rememberMe:true});
  assert.deepEqual(received[0].body.app,{path:'/king-sports/',displayMode:'standalone',deviceHints:{multiTouch:false}});
  assert.equal(sports.getToken(),'credential-1');
  Object.defineProperty(globalThis,'location',{configurable:true,value:new URL('https://jacobuid.github.io/king-videos/')});
  const videos=createBrowserClient({appName:'Kingflix',fetch:send});assert.equal(videos.getToken(),null);
  await videos.request('email-otp/verify-email',{email:'user@example.test',otp:'123456'});
  assert.deepEqual(received[1].body.app,{path:'/king-videos/',name:'Kingflix',displayMode:'standalone',deviceHints:{multiTouch:false}});
  assert.equal(videos.getToken(),'credential-2');assert.equal(sports.getToken(),'credential-1');
  await videos.signOut();assert.equal(videos.getToken(),null);assert.equal(sports.getToken(),'credential-1');
});
