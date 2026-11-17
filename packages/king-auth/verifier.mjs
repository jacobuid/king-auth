/** Verify a browser bearer credential for this site's backend, without an adapter. */
export function createKingAuthVerifier({origin,apiUrl='https://kingauth.app/api/browser',allowLocalhost=false,fetch:send=globalThis.fetch}){
  const site=new URL(origin),endpoint=new URL(apiUrl);
  if(site.origin!==origin)throw Error('Use your exact site origin');
  for(const url of [site,endpoint])if(url.protocol!=='https:'&&!(allowLocalhost&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('HTTPS is required');
  async function getSession(request){
    const authorization=request.headers?.get?request.headers.get('authorization'):request.headers?.authorization;
    if(!authorization||!/^Bearer [^\s]+$/i.test(authorization))return null;
    const response=await send(endpoint.href.replace(/\/$/,'')+'/get-session',{headers:{Origin:origin,Authorization:authorization},redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(response.type==='opaqueredirect'||(response.status>=300&&response.status<400))throw Error('King Auth verification unavailable');
    if(response.status===401)return null;
    if(!response.ok)throw Error('King Auth verification unavailable');
    return response.json();
  }
  async function verifyReauthentication(request,{proof,action}){
    const authorization=request.headers?.get?request.headers.get('authorization'):request.headers?.authorization;
    if(!authorization||!/^Bearer [^\s]+$/i.test(authorization))return false;
    const response=await send(endpoint.href.replace(/\/$/,'')+'/reauthentication/consume',{method:'POST',headers:{Origin:origin,Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify({proof,action}),redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(response.type==='opaqueredirect'||(response.status>=300&&response.status<400))throw Error('King Auth verification unavailable');
    if([400,401,403,429].includes(response.status))return false;
    if(!response.ok)throw Error('King Auth verification unavailable');
    return (await response.json()).allowed===true;
  }
  return {getSession,verifyReauthentication,async isSignedIn(request){return Boolean((await getSession(request))?.user);}};
}

