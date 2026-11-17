import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSessionLocator} from '../server/session-location.mjs';

const tyler={success:true,city:'Tyler',region:'Texas',region_code:'TX',country_code:'US',latitude:32.35,longitude:-95.3};

test('session location limits returned data and caches and deduplicates lookups',async()=>{
  let calls=0,time=0;
  const locate=createSessionLocator({now:()=>time,fetch:async(url,options)=>{
    calls++;assert.equal(new URL(url).hostname,'ipwho.is');assert.equal(options.redirect,'manual');assert.ok(options.signal instanceof AbortSignal);
    return Response.json(tyler);
  }});
  const [first,second]=await Promise.all([locate('8.8.8.8'),locate('::ffff:8.8.8.8')]);
  assert.deepEqual(first,{city:'Tyler',region:'Texas',regionCode:'TX',country:'United States',countryCode:'US',label:'Tyler, TX'});
  assert.deepEqual(first,second);assert.equal(calls,1);
  await locate('8.8.8.8');assert.equal(calls,1);
  time=86400001;await locate('8.8.8.8');assert.equal(calls,2);
});

test('private, invalid and missing addresses never leave the server',async()=>{
  const locate=createSessionLocator({fetch:()=>assert.fail('Must not query private IPs')});
  for(const ip of [undefined,'','not-an-ip','8.8.8.8/extra','127.0.0.1','::1','::ffff:127.0.0.1','10.1.2.3','172.16.1.2','192.168.1.2','100.64.1.2','169.254.1.2','192.0.2.1','2001:db8::1','fc00::1','fe80::1','224.0.0.1'])assert.equal(await locate(ip),null,ip);
  const disabled=createSessionLocator({enabled:false,fetch:()=>assert.fail('Disabled lookup')});
  assert.equal(await disabled('8.8.8.8'),null);
});

test('lookup errors, redirects, quotas, and missing cities return null and are briefly cached',async()=>{
  for(const outcome of [()=>{throw Error('timeout');},()=>new Response(null,{status:302}),()=>new Response(null,{status:429}),()=>Response.json({success:false}),()=>new Response('invalid JSON')]){
    let calls=0,time=0;
    const locate=createSessionLocator({now:()=>time,fetch:async()=>{calls++;return outcome();}});
    assert.equal(await locate('8.8.8.8'),null);assert.equal(await locate('8.8.8.8'),null);assert.equal(calls,1);
    time=300001;assert.equal(await locate('8.8.8.8'),null);assert.equal(calls,2);
  }
});

test('location still shows the region or country when the provider has no city',async()=>{
  const locate=createSessionLocator({fetch:async()=>Response.json({success:true,country_code:'US'})});
  const location=await locate('8.8.8.8');assert.equal(location.city,'');assert.equal(location.country,'United States');assert.equal(location.label,'United States');
});

test('international cities include country and public IPv6 addresses are supported',async()=>{
  const locate=createSessionLocator({fetch:async()=>Response.json({success:true,city:'Paris',region:'Île-de-France',region_code:'IDF',country_code:'FR'})});
  assert.equal((await locate('2606:4700:4700::1111')).label,'Paris, Île-de-France, FR');
});
