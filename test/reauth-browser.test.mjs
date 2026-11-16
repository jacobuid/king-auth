import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {embeddedFixture} from './helpers/embedded.mjs';
import {loadConfig} from '../server/config.mjs';
import {createBrowserAPI} from '../server/browser-api.mjs';
import {createKingAuthVerifier} from '../packages/king-auth/server.mjs';

test('browser reauthentication denies only the action and preserves signed-in UI/storage',{skip:!process.env.KING_AUTH_BROWSER},async()=>{
  const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {AuthProvider,Reauthenticate,useAuth} from './packages/king-auth/react.mjs';
  function App(){const auth=useAuth();const [result,setResult]=React.useState('');return React.createElement(React.Fragment,null,React.createElement('p',{'data-testid':'session'},auth.isSignedIn?'Signed in':'Signed out'),React.createElement(Reauthenticate,{action:'settings:change',onSuccess:async({proof})=>{const response=await fetch('/protected',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.getToken()},body:JSON.stringify({proof})});setResult(response.ok?'Setting changed':'Access denied');}}),React.createElement('output',null,result));}createRoot(document.getElementById('app')).render(React.createElement(AuthProvider,{apiUrl:globalThis.API},React.createElement(App)));`},bundle:true,format:'esm',write:false});
  let api,verifier;
  const f=await embeddedFixture((req,res)=>{
    if(req.url.startsWith('/api/browser/')){
      (async()=>{const response=await api(new Request('http://localhost:3000'+req.url,{method:req.method,headers:{...req.headers,'x-king-auth-client-ip':'127.0.0.1'},...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());})().catch(()=>{res.writeHead(500);res.end();});return true;
    }
    if(req.url==='/protected'){
      (async()=>{let body='';for await(const chunk of req)body+=chunk;const session=await verifier.getSession(req);const allowed=!!session&&await verifier.verifyReauthentication(req,{proof:JSON.parse(body).proof,action:'settings:change'});res.writeHead(allowed?200:403,{'Content-Type':'application/json'});res.end(JSON.stringify({allowed}));})().catch(()=>{res.writeHead(503);res.end();});return true;
    }
    if(req.url==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(bundle.outputFiles[0].text);return true;}
    if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<div id="app"></div><script>globalThis.API='+JSON.stringify(f.url.replace('127.0.0.1','localhost')+'/api/browser')+'</script><script type="module" src="/app.js"></script>');return true;}
  });
  api=createBrowserAPI({auth:f.auth,config:loadConfig({AUTH_BASE_URL:'http://localhost:3000',SIGNUP_APPROVAL_REQUIRED:'false'})});
  const apiUrl=f.url.replace('127.0.0.1','localhost')+'/api/browser';
  verifier=createKingAuthVerifier({origin:f.url,apiUrl,allowLocalhost:true});
  await f.signup(true);
  const login=await api(new Request('http://localhost:3000/api/browser/sign-in/email',{method:'POST',headers:{Origin:f.url,'Content-Type':'application/json'},body:JSON.stringify({email:f.user.email,password:f.user.password,rememberMe:true})}));assert.equal(login.status,200);
  const credentials=(await login.json()).browserSession;const record={...credentials,remember:true};const storageKey='king-auth:browser:'+apiUrl;
  const before=f.database.prepare('SELECT * FROM session WHERE browserOrigin=?').get(f.url);
  const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
  try{
    await page.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:storageKey,value:JSON.stringify(record)});
    await page.goto(f.url);await page.getByTestId('session').filter({hasText:'Signed in'}).waitFor();
    const stored=await page.evaluate(key=>localStorage.getItem(key),storageKey);
    await page.getByLabel('Password',{exact:true}).fill('incorrect');await page.getByRole('button',{name:'Confirm password',exact:true}).click();await page.getByRole('alert').filter({hasText:'Sorry, you cannot access'}).waitFor();
    assert.equal(await page.getByTestId('session').textContent(),'Signed in');assert.equal(await page.evaluate(key=>localStorage.getItem(key),storageKey),stored);
    let injectedStatus=0;
    await page.route('**/api/browser/reauthenticate',route=>injectedStatus?route.fulfill({status:injectedStatus,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({allowed:false,code:'REAUTHENTICATION_FAILED',message:'Confirmation unavailable ('+injectedStatus+')'})}):route.continue());
    for(const status of [401,503]){
      injectedStatus=status;await page.getByRole('button',{name:'Confirm password',exact:true}).click();await page.getByRole('alert').filter({hasText:'Confirmation unavailable ('+status+')'}).waitFor();
      assert.equal(await page.getByTestId('session').textContent(),'Signed in');assert.equal(await page.evaluate(key=>localStorage.getItem(key),storageKey),stored);
    }
    injectedStatus=0;
    await page.getByLabel('Password',{exact:true}).fill(f.user.password);await page.getByRole('button',{name:'Confirm password',exact:true}).click();await page.waitForFunction(()=>document.querySelector('output')?.textContent==='Setting changed');
    assert.equal(await page.getByTestId('session').textContent(),'Signed in');assert.equal(await page.evaluate(key=>localStorage.getItem(key),storageKey),stored);
    assert.deepEqual(f.database.prepare('SELECT * FROM session WHERE browserOrigin=?').get(f.url),before);
  }finally{await browser.close();await f.close();}
});
