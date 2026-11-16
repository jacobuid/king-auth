import {test} from 'node:test';
import assert from 'node:assert/strict';
import {embeddedFixture} from './helpers/embedded.mjs';

test('failed and rate-limited reauthentication preserve the session and never increment sign-in locks',async()=>{
  const f=await embeddedFixture();try{
    await f.signup(true);const before=f.database.prepare('SELECT * FROM session').get();const cookie=f.getCookie();
    for(let i=0;i<5;i++){
      const result=await f.request('reauthenticate',{action:'settings:change',password:'wrong'});assert.equal(result.status,403);assert.equal(result.data.allowed,false);assert.equal(result.data.code,'REAUTHENTICATION_FAILED');assert.equal(result.headers.has('set-cookie'),false);
    }
    assert.equal((await f.request('reauthenticate',{action:'settings:change',password:'wrong'})).status,429);
    assert.equal(f.getCookie(),cookie);assert.deepEqual(f.database.prepare('SELECT * FROM session').get(),before);
    const user=f.database.prepare('SELECT failedSignIns,signInLocked FROM user').get();assert.equal(user.failedSignIns,0);assert.equal(user.signInLocked,0);
    assert.equal((await f.request('/private')).status,200);
  }finally{await f.close();}
});

test('proof is action/site/session bound, short-lived and atomically single-use',async()=>{
  const f=await embeddedFixture();try{
    await f.signup(true);const before=f.database.prepare('SELECT * FROM session').get();const cookie=f.getCookie();
    const issued=await f.request('reauthenticate',{action:'settings:change',password:f.user.password});assert.equal(issued.status,200,JSON.stringify(issued.data));assert.equal(issued.headers.has('set-cookie'),false);assert.match(issued.data.proof,/^[A-Za-z0-9_-]{43}$/);
    assert.ok(new Date(issued.data.expiresAt)-Date.now()<=300000);assert.deepEqual(f.database.prepare('SELECT * FROM session').get(),before);assert.equal(f.getCookie(),cookie);
    const req={headers:{cookie}};
    assert.equal(await f.adapter.verifyReauthentication(req,{proof:issued.data.proof,action:'settings:delete'}),false);
    const results=await Promise.all([f.adapter.verifyReauthentication(req,{proof:issued.data.proof,action:'settings:change'}),f.adapter.verifyReauthentication(req,{proof:issued.data.proof,action:'settings:change'})]);assert.deepEqual(results.sort(),[false,true]);
    const expired=(await f.request('reauthenticate',{action:'settings:change',password:f.user.password})).data;
    f.database.prepare("UPDATE verification SET expiresAt=? WHERE identifier LIKE 'reauth-proof:%'").run(Date.now()-1000);
    assert.equal(await f.adapter.verifyReauthentication(req,{proof:expired.proof,action:'settings:change'}),false);
    const scoped=(await f.request('reauthenticate',{action:'settings:change',password:f.user.password})).data;
    f.setCookie('');await f.request('sign-in/email',{email:f.user.email,password:f.user.password,rememberMe:true});
    assert.equal(await f.adapter.verifyReauthentication({headers:{cookie:f.getCookie()}},{proof:scoped.proof,action:'settings:change'}),false);
    f.setCookie(cookie);assert.equal(await f.adapter.verifyReauthentication(req,{proof:scoped.proof,action:'settings:change'}),true);
    assert.equal((await f.request('/private')).status,200);
  }finally{await f.close();}
});
