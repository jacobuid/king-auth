import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {embeddedFixture} from './helpers/embedded.mjs';

test('unstyled React signup, account controls, backend check and sign-out in Chrome',{skip:!process.env.KING_AUTH_BROWSER},async()=>{
  const bundle=await build({entryPoints:['examples/website/client.mjs'],bundle:true,format:'esm',write:false,target:'es2022'});
  const f=await embeddedFixture((req,res)=>{
    if(req.url==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(bundle.outputFiles[0].text);return true;}
    if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<div id="app"></div><script type="module" src="/app.js"></script>');return true;}
    if(req.url==='/api/private')return false;
  });
  const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(f.url);await page.getByRole('button',{name:'Create account',exact:true}).click();
    assert.equal(await page.locator('input[name=username],input[type=tel]').count(),0);
    await page.getByLabel('Email address',{exact:true}).fill(f.user.email);
    await page.getByLabel('Create password',{exact:true}).fill(f.user.password);
    await page.getByLabel('Confirm new password',{exact:true}).fill(f.user.password);
    await page.getByLabel('Stay signed in on this device').check();
    await page.getByRole('button',{name:'Create account',exact:true}).last().click();
    await page.getByLabel('Verification code',{exact:true}).waitFor();
    await page.getByLabel('Verification code',{exact:true}).fill(f.sent.at(-1).otp);
    await page.getByRole('button',{name:'Verify email',exact:true}).click();
    await page.getByTestId('signed-in').waitFor();
    assert.equal(await page.locator('[style]').count(),0);
    assert.equal(await page.locator('input[type=tel],input[name=username]').count(),0);
    await page.getByRole('button',{name:'Check protected backend'}).click();
    await page.waitForFunction(()=>document.querySelector('output')?.textContent.includes('userId'));
    const id=JSON.parse(await page.locator('output').textContent()).userId;assert.match(id,/^[0-9a-f-]{36}$/);
    await page.getByLabel('Current password',{exact:true}).fill(f.user.password);
    await page.getByLabel('New password',{exact:true}).fill('A replacement password 123!');
    await page.getByLabel('Confirm new password',{exact:true}).fill('Mismatch password 123!');
    await page.getByRole('button',{name:'Change password',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'New passwords must match'}).waitFor();
    await page.getByLabel('Session duration on this device').selectOption('604800');
    await page.getByRole('button',{name:'Save session duration'}).click();
    await page.getByRole('status').filter({hasText:'Session duration saved'}).waitFor();
    await page.reload();await page.getByTestId('signed-in').waitFor();
    const cookies=await page.context().cookies();assert.ok(cookies.find(item=>item.name==='kingauth'&&item.httpOnly));
    await page.getByRole('button',{name:'Sign out',exact:true}).last().click();
    await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor();
    assert.equal((await page.request.get(f.url+'/api/private')).status(),401);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await f.close();}
});
