import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordSessionActivity} from '../server/session-activity.mjs';

test('activity is throttled, skips expired sessions and does not affect session expiry',async()=>{
  const now=new Date('2026-11-16T12:00:00Z'),session={id:'session',userId:'user',expiresAt:new Date('2026-11-17'),lastActiveAt:null};
  const writes=[];const adapter={update:async data=>{writes.push(data);return {id:'session'};}};
  assert.equal(await recordSessionActivity(adapter,session,now),true);
  assert.deepEqual(writes[0].update,{lastActiveAt:now});
  assert.ok(writes[0].where.some(item=>item.field==='userId'&&item.value==='user'));
  assert.ok(writes[0].where.some(item=>item.field==='lastActiveAt'&&item.value===null));
  assert.equal(await recordSessionActivity(adapter,{...session,lastActiveAt:new Date(now-1000)},now),false);
  assert.equal(await recordSessionActivity(adapter,{...session,expiresAt:new Date(now-1)},now),false);
  assert.equal(await recordSessionActivity(adapter,null,now),false);assert.equal(writes.length,1);
  assert.equal(await recordSessionActivity({update:async()=>null},session,now),false);
  assert.equal(await recordSessionActivity({update:async()=>{throw Error('storage unavailable');}},session,now),false);
});
