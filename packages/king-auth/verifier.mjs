import {createRemoteJWKSet,customFetch,jwtVerify} from 'jose';

/** Verify centrally by default, or verify short-lived access passes locally. */
export function createKingAuthVerifier({origin,apiUrl='https://kingauth.app/api/browser',verification='central',allowLocalhost=false,fetch:send=globalThis.fetch}){
  const site=new URL(origin),endpoint=new URL(apiUrl);
  if(site.origin!==origin)throw Error('Use your exact site origin');
  if(!['central','access-pass'].includes(verification))throw Error('Choose central or access-pass verification');
  if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error('Use a plain King Auth API URL');
  for(const url of [site,endpoint])if(url.protocol!=='https:'&&!(allowLocalhost&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('HTTPS is required');
  const issuer=endpoint.href.replace(/\/$/,'');
  const keys=createRemoteJWKSet(new URL(issuer+'/jwks'),{
    cacheMaxAge:3600000,cooldownDuration:30000,timeoutDuration:10000,
    [customFetch]:(url,options)=>send(url,{...options,headers:new Headers([...options.headers,['Origin',origin]])}),
  });
  async function verifyAccessPass(request){
    const authorization=request.headers?.get?request.headers.get('authorization'):request.headers?.authorization;
    if(!authorization||!/^Bearer [^\s]+$/i.test(authorization)||authorization.length>16384)return null;
    try{
      const {payload}=await jwtVerify(authorization.slice(7),keys,{
        algorithms:['EdDSA'],issuer,audience:origin,maxTokenAge:'30m',
        requiredClaims:['sub','iat','exp','sid','kind'],
      });
      const {user,session}=payload;
      if(payload.kind!=='king-auth-access'||payload.exp<=payload.iat||payload.exp-payload.iat>1800||
        !user||typeof user!=='object'||user.id!==payload.sub||user.emailVerified!==true||
        !session||typeof session!=='object'||session.id!==payload.sid||
        typeof payload.sub!=='string'||typeof payload.sid!=='string'||
        !Number.isFinite(Date.parse(session.createdAt))||!Number.isFinite(Date.parse(session.expiresAt))||
        payload.exp>Math.floor(Date.parse(session.expiresAt)/1000))return null;
      return {user:{id:user.id,name:user.name,email:user.email,emailVerified:true},session:{id:session.id,createdAt:session.createdAt,expiresAt:session.expiresAt}};
    }catch(error){
      if(['ERR_JWT_EXPIRED','ERR_JWT_CLAIM_VALIDATION_FAILED','ERR_JWS_SIGNATURE_VERIFICATION_FAILED','ERR_JWS_INVALID','ERR_JWT_INVALID','ERR_JOSE_NOT_SUPPORTED','ERR_JWKS_NO_MATCHING_KEY'].includes(error.code))return null;
      throw Error('King Auth verification unavailable',{cause:error});
    }
  }
  async function getSession(request){
    if(verification==='access-pass')return verifyAccessPass(request);
    const authorization=request.headers?.get?request.headers.get('authorization'):request.headers?.authorization;
    if(!authorization||!/^Bearer [^\s]+$/i.test(authorization))return null;
    const response=await send(endpoint.href.replace(/\/$/,'')+'/get-session',{headers:{Origin:origin,Authorization:authorization},redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(response.type==='opaqueredirect'||(response.status>=300&&response.status<400))throw Error('King Auth verification unavailable');
    if(response.status===401)return null;
    if(!response.ok)throw Error('King Auth verification unavailable');
    const data=await response.json();
    return data?{user:data.user,session:data.session}:null;
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
  return {getSession,verifyAccessPass,verifyReauthentication,async isSignedIn(request){return Boolean((await getSession(request))?.user);}};
}

