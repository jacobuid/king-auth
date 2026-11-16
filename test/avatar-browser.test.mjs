import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

test('avatars render Gravatar or local silhouette, track email changes, and honor overrides',{skip:!process.env.KING_AUTH_BROWSER},async()=>{
  const source=`import React from 'react';import {createRoot} from 'react-dom/client';import {AuthProvider,ProfileMenu,Avatar} from './packages/king-auth/react.mjs';
  function App(){const [email,setEmail]=React.useState('has@example.test');return React.createElement(React.Fragment,null,React.createElement(Avatar,{email,alt:'Test avatar'}),React.createElement('button',{onClick:()=>setEmail('missing@example.test')},'Change email'),React.createElement('button',{onClick:()=>setEmail('offline@example.test')},'Offline email'),React.createElement(AuthProvider,{mode:'proxy'},React.createElement(ProfileMenu,{avatar:React.createElement('span',{'data-testid':'custom-avatar'},'Custom')}),React.createElement(ProfileMenu,{gravatar:false,triggerLabel:'Generic profile'})));}createRoot(document.getElementById('app')).render(React.createElement(App));`;
  const bundle=await build({stdin:{contents:source,resolveDir:process.cwd()},bundle:true,format:'esm',write:false});
  const server=http.createServer((req,res)=>{if(req.url==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(bundle.outputFiles[0].text);}if(req.url==='/auth/api/get-session'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({user:{id:'avatar-test',email:'private@example.test',emailVerified:true},session:{id:'session-test'}}));}res.writeHead(200,{'Content-Type':'text/html'});res.end('<div id="app"></div><script type="module" src="/app.js"></script>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();let calls=0;
  await page.route('https://www.gravatar.com/avatar/**',async route=>{
    calls++;
    if(calls===1)return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>'});
    if(calls===2)return route.fulfill({status:404,body:''});
    return route.abort();
  });
  try{
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.waitForFunction(()=>document.querySelector('img[alt="Test avatar"]')?.naturalWidth>0);
    await page.getByRole('button',{name:'Open profile menu'}).waitFor();assert.equal(await page.getByTestId('custom-avatar').count(),1);
    assert.equal(await page.getByRole('button',{name:'Generic profile'}).locator('[data-avatar-fallback]').count(),1);
    assert.equal(calls,1); // Custom/disabled avatars must not contact Gravatar.
    const missing=page.waitForResponse(response=>response.url().startsWith('https://www.gravatar.com/avatar/')&&response.status()===404);
    await page.getByRole('button',{name:'Change email',exact:true}).click();await missing;
    await page.waitForFunction(()=>document.querySelector('svg[aria-label="Test avatar"]')&&document.querySelectorAll('img[alt="Test avatar"]').length===0);
    const offline=page.waitForEvent('requestfailed',{predicate:request=>request.url().startsWith('https://www.gravatar.com/avatar/')});
    await page.getByRole('button',{name:'Offline email',exact:true}).click();await offline;
    await page.waitForFunction(()=>document.querySelector('svg[aria-label="Test avatar"]')&&document.querySelectorAll('img[alt="Test avatar"]').length===0);
    assert.equal(await page.locator('[style]').count(),0);
    assert.equal(calls,3);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
