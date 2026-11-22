import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

test('startup checks survive StrictMode, focus, storage, throttling and fresh startup',{skip:!process.env.KING_AUTH_BROWSER},async()=>{
  const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {AuthProvider,useAuth} from './packages/king-auth/forms.mjs';function App(){const a=useAuth();return React.createElement('button',{onClick:()=>a.refresh().catch(()=>{})},a.error?'error':a.isSignedIn?'signed in':'loading');}createRoot(document.getElementById('app')).render(React.createElement(React.StrictMode,null,React.createElement(AuthProvider,{sessionCheck:'startup'},React.createElement(App))));`,resolveDir:process.cwd()},bundle:true,format:'esm',write:false});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();let checks=0,signins=0,throttled=false;
  await page.route('https://test.example/**',route=>route.fulfill({contentType:'text/html',body:'<div id="app"></div><script type="module">'+bundle.outputFiles[0].text+'</script>'}));
  await page.route('https://kingauth.app/api/browser/**',route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization','Access-Control-Allow-Methods':'GET'}});
    if(route.request().url().endsWith('/get-session'))checks++;else signins++;
    return route.fulfill({status:throttled?429:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Retry-After','Retry-After':'30'},contentType:'application/json',body:JSON.stringify(throttled?{message:'Wait'}:{user:{id:'u'},session:{id:'s',expiresAt:new Date(Date.now()+86400000).toISOString()}})});
  });
  await page.addInitScript(()=>localStorage.setItem('king-auth:browser:https://kingauth.app/api/browser',JSON.stringify({token:'saved',remember:true,expiresAt:new Date(Date.now()+86400000).toISOString()})));
  try{
    await page.goto('https://test.example');await page.getByText('signed in',{exact:true}).waitFor();assert.equal(checks,1);
    await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('storage'));});
    await Promise.all([page.waitForResponse(r=>r.url().endsWith('/get-session')),page.getByText('signed in',{exact:true}).click()]);
    assert.equal(checks,2);
    throttled=true;await page.reload();await page.getByText('error',{exact:true}).waitFor();assert.equal(checks,3);
    assert.ok(await page.evaluate(()=>localStorage.getItem('king-auth:browser:https://kingauth.app/api/browser')));
    throttled=false;await page.reload();await page.getByText('signed in',{exact:true}).waitFor();assert.equal(checks,4);assert.equal(signins,0);
  }finally{await browser.close();}
});


test('SDK exposes Retry-After and preserves remembered tokens on 429',async()=>{
  const {createBrowserClient}=await import('../packages/king-auth/browser.mjs');
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const key='king-auth:browser:https://kingauth.app/api/browser';
  const values=new Map([[key,JSON.stringify({token:'saved',remember:true,expiresAt:new Date(Date.now()+86400000).toISOString()})]]);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}});
  try{
    const client=createBrowserClient({fetch:async()=>new Response(JSON.stringify({message:'Wait'}),{status:429,headers:{'Retry-After':'30'}})});
    await assert.rejects(client.getSession(),e=>e.status===429&&e.retryAfter==='30');
    assert.equal(client.getToken(),'saved');
  }finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;}
});
