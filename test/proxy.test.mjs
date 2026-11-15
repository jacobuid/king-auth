import {test} from 'node:test';
import assert from 'node:assert/strict';
import {embeddedFixture} from './helpers/embedded.mjs';

test('embedded email-only signup, backend checks, persistence, CSRF and logout',async()=>{
  const f=await embeddedFixture();try{
    assert.equal((await f.request('/private')).status,401);
    const id=await f.signup(true);assert.match(id,/^[0-9a-f-]{36}$/);
    const session=await f.request('get-session');assert.equal(session.data.user.id,id);assert.equal(session.data.session.token,undefined);
    assert.ok(new Date(session.data.session.expiresAt)-Date.now()>1094*86400000);
    assert.ok(new Date(session.data.session.expiresAt)-new Date(session.data.session.createdAt)<=94608000000);
    assert.match(session.headers.get('set-cookie'),/HttpOnly/);assert.match(session.headers.get('set-cookie'),/Max-Age=34560000/);
    assert.equal((await f.request('/private')).status,200);
    const before=f.getRequests();assert.equal((await f.request('sign-out',{}, {Origin:'https://evil.example'})).status,403);assert.equal(before,f.getRequests());
    assert.equal((await f.request('oauth2/create-client',{})).status,404);
    assert.equal((await f.request('account/session-duration',{seconds:94608001})).status,400);
    const changed=await f.request('account/session-duration',{seconds:604800,persistent:true});assert.equal(changed.status,200,JSON.stringify(changed.data));
    const short=await f.request('get-session');const expires=new Date(short.data.session.expiresAt).getTime();assert.ok(expires-Date.now()<=604800000);assert.ok(expires-Date.now()>604700000);
    assert.equal(new Date((await f.request('get-session')).data.session.expiresAt).getTime(),expires);
    const extended=await f.request('account/session-duration',{seconds:94608000,persistent:true});assert.equal(extended.status,200);assert.ok(new Date((await f.request('get-session')).data.session.expiresAt)-Date.now()>1094*86400000);
    const listed=await f.request('account/sessions');assert.equal(listed.status,200);assert.equal(listed.data.length,1);assert.equal(listed.data[0].token,undefined);assert.equal(listed.data[0].current,true);
    const original=f.getCookie();f.setCookie(original.slice(0,-5)+'abcde');assert.equal((await f.request('/private')).status,401);f.setCookie(original);
    await f.request('sign-out',{});f.setCookie(original);assert.equal((await f.request('/private')).status,401);
  }finally{await f.close();}
});

test('embedded email changes keep UUID, short cookies, reset revocation and session ownership',async()=>{
  const f=await embeddedFixture();try{
    const id=await f.signup(false);const short=await f.request('get-session');assert.doesNotMatch(short.headers.get('set-cookie'),/Max-Age=/);
    await f.request('email-otp/send-verification-otp',{email:f.user.email,type:'email-verification'});
    assert.equal((await f.request('email-otp/request-email-change',{newEmail:'changed@example.test',otp:f.sent.at(-1).otp})).status,200);
    assert.equal((await f.request('email-otp/change-email',{newEmail:'changed@example.test',otp:f.sent.at(-1).otp})).status,200);
    const changed=await f.request('get-session');assert.equal(changed.data.user.id,id);assert.equal(changed.data.user.email,'changed@example.test');
    assert.equal((await f.request('account/revoke-session',{sessionId:'someone-elses-session'})).status,404);
    const original=f.getCookie();await f.request('email-otp/request-password-reset',{email:'changed@example.test'});
    assert.equal((await f.request('email-otp/reset-password',{email:'changed@example.test',otp:f.sent.at(-1).otp,password:'Replacement password 123!'})).status,200);
    f.setCookie(original);assert.equal((await f.request('/private')).status,401);
  }finally{await f.close();}
});

test('session controls require recent sign-in and sign out other sites immediately',async()=>{
  const f=await embeddedFixture();try{
    await f.signup(true);const first=f.getCookie();
    f.setCookie('');assert.equal((await f.request('sign-in/email',{email:f.user.email,password:f.user.password,rememberMe:true})).status,200);
    const second=f.getCookie();assert.equal((await f.request('account/sessions')).data.length,2);
    await f.request('revoke-other-sessions',{});f.setCookie(first);assert.equal((await f.request('/private')).status,401);f.setCookie(second);
    f.database.prepare('UPDATE session SET createdAt = ?').run(Date.now()-700000);
    assert.equal((await f.request('account/session-duration',{seconds:94608000})).status,403);
    assert.equal((await f.request('account/revoke-session',{sessionId:'unknown'})).status,403);
  }finally{await f.close();}
});
