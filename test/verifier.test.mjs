import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {createKingAuthVerifier} from '@jacobuid/king-auth/verifier';
import {createKingAuthVerifier as serverVerifier} from '@jacobuid/king-auth/server';

const request=new Request('https://app.example/private',{headers:{Authorization:'Bearer credential'}});
const proof={proof:'proof',action:'settings:change'};

test('standalone verifier bundles for edge runtimes and preserves the server export',async()=>{
  assert.equal(serverVerifier,createKingAuthVerifier);
  const contents=await readFile(new URL('../packages/king-auth/verifier.mjs',import.meta.url),'utf8');
  const result=await build({stdin:{contents},bundle:true,platform:'browser',format:'esm',write:false,metafile:true});
  assert.deepEqual(Object.keys(result.metafile.inputs),['<stdin>']);
});

test('Workers-compatible fetch verifies sessions and reauthentication',async()=>{
  const session={user:{id:'user',emailVerified:true},session:{id:'session'}};
  const verifier=createKingAuthVerifier({origin:'https://app.example',fetch:async(url,options)=>{
    assert.equal(options.redirect,'manual');
    assert.equal(options.headers.Origin,'https://app.example');
    assert.equal(options.headers.Authorization,'Bearer credential');
    assert.ok(options.signal instanceof AbortSignal);
    if(url.endsWith('/get-session'))return Response.json(session);
    assert.equal(options.method,'POST');
    assert.deepEqual(JSON.parse(options.body),proof);
    return Response.json({allowed:true});
  }});
  assert.deepEqual(await verifier.getSession(request),session);
  assert.equal(await verifier.isSignedIn(request),true);
  assert.equal(await verifier.verifyReauthentication(request,proof),true);
});

test('redirects fail closed without reading a response body',async()=>{
  for(const status of [300,301,302,303,304,305,307,308,399,0]){
    let calls=0;
    const verifier=createKingAuthVerifier({origin:'https://app.example',fetch:async(_url,options)=>{
      calls++;
      assert.equal(options.redirect,'manual');
      return {status,type:status===0?'opaqueredirect':'default',ok:true,json(){assert.fail('Redirect body must not be read');}};
    }});
    await assert.rejects(verifier.getSession(request),/verification unavailable/);
    await assert.rejects(verifier.isSignedIn(request),/verification unavailable/);
    await assert.rejects(verifier.verifyReauthentication(request,proof),/verification unavailable/);
    assert.equal(calls,3);
  }
});

test('invalid credentials and service failures retain their existing behavior',async()=>{
  for(const status of [400,401,403,429,500]){
    const verifier=createKingAuthVerifier({origin:'https://app.example',fetch:async()=>new Response(null,{status})});
    if(status===401)assert.equal(await verifier.getSession(request),null);
    else await assert.rejects(verifier.getSession(request),/verification unavailable/);
    if(status===500)await assert.rejects(verifier.verifyReauthentication(request,proof),/verification unavailable/);
    else assert.equal(await verifier.verifyReauthentication(request,proof),false);
  }
});
