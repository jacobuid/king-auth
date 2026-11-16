import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Readable} from 'node:stream';
import http from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {getMigrations} from 'better-auth/db/migration';
import {createAuth} from '../server/auth.mjs';
import {loadConfig} from '../server/config.mjs';
import {createBrowserAPI} from '../server/browser-api.mjs';

test('browser-only forms work across origins with cookies omitted and separate site sessions',{skip:!process.env.KING_AUTH_BROWSER},async()=>{
  const database=new DatabaseSync(':memory:'),sent=[];const config=loadConfig({AUTH_BASE_URL:'http://localhost:3000',SIGNUP_APPROVAL_REQUIRED:'false'});
  const auth=createAuth({config,database,sender:{emailEnabled:true,smsEnabled:false,email:async data=>sent.push(data)}});
  await(await getMigrations(auth.options)).runMigrations();const api=createBrowserAPI({auth,config});
  const receivedCookies=[];
  const server=http.createServer(async(req,res)=>{
    receivedCookies.push(req.headers.cookie||'');
    const response=await api(new Request(config.baseURL+req.url,{method:req.method,headers:{...req.headers,'x-king-auth-client-ip':'127.0.0.1'},...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'})}));
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const apiUrl='http://127.0.0.1:'+server.address().port+'/api/browser';
  const bundle=await build({entryPoints:['examples/browser-only/client.mjs'],bundle:true,format:'esm',write:false,target:'es2022'});
  const host=()=>http.createServer((req,res)=>{if(req.url==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(bundle.outputFiles[0].text);}res.writeHead(200,{'Content-Type':'text/html'});res.end('<div id="app"></div><script>globalThis.KING_AUTH_EXAMPLE_API='+JSON.stringify(apiUrl)+'</script><script type="module" src="/app.js"></script>');});
  const first=host(),second=host();await Promise.all([new Promise(resolve=>first.listen(0,'127.0.0.1',resolve)),new Promise(resolve=>second.listen(0,'127.0.0.1',resolve))]);
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--test-third-party-cookie-phaseout']});const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const email='static@example.test',password='Abcd12!x';
  try{
    await context.addCookies([{name:'should-not-be-sent',value:'probe',url:apiUrl}]);
    await page.goto('http://localhost:'+first.address().port);
    await page.getByRole('button',{name:'Create account',exact:true}).click();
    await page.getByLabel('Email address',{exact:true}).fill(email);await page.getByLabel('Create password',{exact:true}).fill(password);await page.getByLabel('Confirm new password',{exact:true}).fill(password);await page.getByLabel('Stay signed in on this device').check();
    await page.locator('form').getByRole('button',{name:'Create account',exact:true}).click();await page.getByLabel('Verification code').waitFor();await page.getByLabel('Verification code').fill(sent.at(-1).otp);await page.getByRole('button',{name:'Verify email',exact:true}).click();await page.getByTestId('signed-in').waitFor();
    assert.equal(await page.locator('[style]').count(),0);
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('king-auth:browser:')).length),1);
    await page.reload();await page.getByTestId('signed-in').waitFor();
    const other=await context.newPage();await other.goto('http://localhost:'+second.address().port);await other.getByRole('heading',{name:'Sign in',exact:true}).waitFor();
    await other.getByLabel('Email address',{exact:true}).fill(email);await other.getByLabel('Password',{exact:true}).fill(password);await other.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();await other.getByTestId('signed-in').waitFor();
    await other.getByRole('button',{name:'Open profile menu'}).click();await other.getByRole('menuitem',{name:'Manage account'}).click();
    const modal=other.getByRole('dialog',{name:'Account',exact:true});await modal.waitFor();
    await modal.getByLabel('Session duration on this device').selectOption('604800');await modal.getByRole('button',{name:'Save session duration'}).click();await modal.getByRole('status').filter({hasText:'Session duration saved'}).waitFor();
    await other.keyboard.press('Escape');await other.reload();await other.getByTestId('signed-in').waitFor();
    await page.getByRole('button',{name:'Open profile menu'}).click();await page.getByRole('menuitem',{name:'Sign out',exact:true}).click();await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor();
    await other.reload();await other.getByTestId('signed-in').waitFor();
    assert.ok(receivedCookies.length>0);assert.ok(receivedCookies.every(value=>value===''));assert.deepEqual(errors,[]);
  }finally{await browser.close();await Promise.all([server,first,second].map(item=>new Promise(resolve=>item.close(resolve))));database.close();}
});
