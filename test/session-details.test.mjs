import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sessionDetails} from '../server/session-details.mjs';

test('session labels identify the app and classify devices without exposing raw user agents',()=>{
  for(const [userAgent,device] of [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/157','Computer'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile','Phone'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel) Mobile','Phone'],
    ['Mozilla/5.0 (iPad; CPU OS 18_0)','Tablet'],
    ['Mozilla/5.0 (Linux; Android 14; Tablet)','Tablet'],
    ['', 'Unknown device'],
  ])assert.deepEqual(sessionDetails({browserOrigin:'https://king-sports.example',userAgent}),{appName:'King Sports',appOrigin:'https://king-sports.example',device});
  assert.equal(sessionDetails({browserOrigin:'https://kingauth.app'}).appName,'King Auth');
  for(const browserOrigin of [undefined,'invalid','javascript:alert(1)']){
    assert.deepEqual(sessionDetails({browserOrigin}),{appName:'Unknown app',appOrigin:null,device:'Unknown device'});
  }
});
