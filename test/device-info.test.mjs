import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deviceInfo} from '../packages/king-auth/device-info.mjs';
import {browserAppInfo,normalizeAppInfo} from '../packages/king-auth/app-info.mjs';
import {sessionDetails} from '../server/session-details.mjs';

test('readable device, OS and browser labels handle mobile and desktop browser variants',()=>{
  for(const [ua,expected] of [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Version/18.0 Mobile/15E148 Safari/604.1',['Phone','iPhone','iOS','Safari']],
    ['Mozilla/5.0 (iPad) Version/18.0 Mobile/15E148 Safari/604.1',['Tablet','iPad','iPadOS','Safari']],
    ['Mozilla/5.0 (iPhone) CriOS/130.0 Mobile Safari/604.1',['Phone','iPhone','iOS','Chrome']],
    ['Mozilla/5.0 (iPhone) EdgiOS/130.0 Mobile Safari/604.1',['Phone','iPhone','iOS','Edge']],
    ['Mozilla/5.0 (iPhone) FxiOS/130.0 Mobile Safari/604.1',['Phone','iPhone','iOS','Firefox']],
    ['Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36',['Phone','Android phone','Android','Chrome']],
    ['Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Safari/537.36',['Tablet','Android tablet','Android','Chrome']],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36 Edg/130.0',['Computer','Windows computer','Windows','Edge']],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1',['Computer','Mac','macOS','Safari']],
    ['Mozilla/5.0 (X11; CrOS x86_64) Chrome/130.0 Safari/537.36',['Computer','Chromebook','Chrome OS','Chrome']],
    ['Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0',['Computer','Linux computer','Linux','Firefox']],
    ['', ['Unknown device','Unknown device',null,null]],
  ]){
    const result=deviceInfo(ua);assert.deepEqual([result.device,result.deviceName,result.osName,result.browserName],expected,ua);
  }
});

test('touch hints improve iPad detection without labelling every touchscreen a tablet',()=>{
  const ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1';
  assert.equal(deviceInfo(ua,{multiTouch:true}).deviceName,'iPad');
  assert.equal(deviceInfo(ua,{multiTouch:false}).deviceName,'Mac');
  assert.equal(deviceInfo('Mozilla/5.0 (Windows NT 10.0)',{multiTouch:true}).device,'Computer');
  assert.equal(deviceInfo('Mozilla/5.0 (Linux; Android 14)',{mobile:true}).device,'Phone');
  const details=sessionDetails({userAgent:ua,browserDeviceHints:JSON.stringify({multiTouch:true})});assert.equal(details.deviceName,'iPad');
  assert.equal(sessionDetails({userAgent:ua,browserDeviceHints:'invalid JSON'}).deviceName,'Mac');
});

test('only coarse capabilities and supported low entropy platform hints are captured',()=>{
  const app=browserAppInfo({location:new URL('https://jacobuid.github.io/king-comics/'),navigator:{maxTouchPoints:5,userAgentData:{mobile:false,platform:'macOS',model:'Private model'}},matchMedia:()=>({matches:false})});
  assert.deepEqual(app.deviceHints,{multiTouch:true,mobile:false,platform:'macOS'});
  assert.deepEqual(normalizeAppInfo('https://example.test',{deviceHints:{multiTouch:true,screenWidth:1234,model:'ignored'}}).deviceHints,{multiTouch:true});
  for(const deviceHints of [{multiTouch:'yes'},{mobile:1},{platform:'Unknown platform'},null,[]])assert.throws(()=>normalizeAppInfo('https://example.test',{deviceHints}));
});
