import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gravatarUrl} from '../packages/king-auth/avatar.mjs';

test('Gravatar uses normalized SHA-256, safe size, G rating and 404 fallback',async()=>{
  const url=new URL(await gravatarUrl(' MyEmail@example.com ',80));
  assert.equal(url.origin,'https://www.gravatar.com');
  assert.equal(url.pathname,'/avatar/'+createHash('sha256').update('myemail@example.com').digest('hex'));
  assert.equal(url.searchParams.get('d'),'404');assert.equal(url.searchParams.get('r'),'g');assert.equal(url.searchParams.get('s'),'80');
  assert.equal(new URL(await gravatarUrl('a@example.test',9000)).searchParams.get('s'),'2048');
  assert.equal(await gravatarUrl('   '),null);
});
