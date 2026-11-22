import {AUTH_ROUTES,publicData} from '../packages/king-auth/routes.mjs';
import {normalizeAppInfo} from '../packages/king-auth/app-info.mjs';

const anonymous=new Set(['sign-in/email','sign-in/username','sign-in/phone-number','sign-up/email','sign-in-code/send','email-otp/send-verification-otp','email-otp/verify-email','email-otp/request-password-reset','email-otp/reset-password','phone-number/send-otp','phone-number/request-password-reset','phone-number/reset-password']);
class SessionRateLimitError extends Error {
  constructor(response){super('Session verification rate limited');this.response=response;}
}
function validOrigin(origin){
  try{const url=new URL(origin);return url.origin===origin&&(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)));}catch{return false;}
}

/** Cookie-free browser gateway. Public HTTPS origins, authenticated bearer requests. */
export function createBrowserAPI({auth,config}){
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Expose-Headers':'Retry-After','Access-Control-Max-Age':'600','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const json=(status,data,extra={})=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json',...extra}});
  async function withAccessPass(current,origin){
    if(!current)return null;
    const now=Math.floor(Date.now()/1000);
    const expires=Math.min(now+1800,Math.floor(Date.parse(current.session.expiresAt)/1000));
    if(expires<=now)return null;
    const {token}=await auth.api.signJWT({body:{payload:{
      iss:config.baseURL+'/api/browser',aud:origin,sub:current.user.id,
      iat:now,exp:expires,kind:'king-auth-access',sid:current.session.id,
      user:current.user,session:current.session,
    }}});
    return {...current,accessPass:{token,expiresAt:new Date(expires*1000).toISOString()}};
  }
  async function session(headers,origin){
    const response=await auth.handler(new Request(config.baseURL+'/api/auth/get-session',{headers}));
    if(response.status===401)return null;
    if(response.status===429)throw new SessionRateLimitError(response);
    if(!response.ok)throw Error('Session verification failed');
    const data=await response.json();if(!data?.session||!data?.user?.emailVerified)return null;
    const {adapter}=await auth.$context;
    const row=await adapter.findOne({model:'session',where:[{field:'id',value:data.session.id}]});
    if(!row||row.browserOrigin!==origin)return null;
    return {user:{id:data.user.id,name:data.user.name,email:data.user.email,emailVerified:data.user.emailVerified},session:{id:data.session.id,createdAt:data.session.createdAt,expiresAt:data.session.expiresAt}};
  }
  return async function handle(request){
    const origin=request.headers.get('origin');
    if(!validOrigin(origin))return new Response(JSON.stringify({message:'Use an HTTPS website or loopback development origin.'}),{status:403,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    const route=new URL(request.url).pathname.replace(/^\/api\/browser\//,'');const rule=AUTH_ROUTES.get(route);
    if(!rule)return json(404,{message:'Not found'});
    if(request.method==='OPTIONS'){
      const method=request.headers.get('access-control-request-method');
      const headers=(request.headers.get('access-control-request-headers')||'').toLowerCase().split(',').map(value=>value.trim()).filter(Boolean);
      if(method!==rule[0]||headers.some(value=>!['authorization','content-type'].includes(value)))return json(403,{message:'Preflight rejected'});
      return new Response(null,{status:204,headers:cors});
    }
    if(request.method!==rule[0])return json(405,{message:'Method not allowed'});
    const authorization=request.headers.get('authorization');
    if(authorization&&(!/^Bearer [^\s]+$/i.test(authorization)||authorization.length>2048))return json(401,{message:'Invalid credential'});
    // Never forward Cookie or browser-controlled internal headers. The Origin is
    // rewritten only after this cookie-free gateway enforces its own policy.
    const headers=new Headers({Origin:config.baseURL,'x-king-auth-browser-origin':origin,'x-king-auth-client-ip':request.headers.get('x-king-auth-client-ip')||'127.0.0.1','User-Agent':request.headers.get('user-agent')||'King Auth browser'});
    if(authorization)headers.set('Authorization',authorization);
    try{
      if(route==='jwks'){
        const response=await auth.handler(new Request(config.baseURL+'/api/auth/jwks',{headers}));
        return json(response.status,await response.json(),response.ok?{'Cache-Control':'public, max-age=3600'}:{});
      }
      if(route==='get-session'||route==='access-pass')return json(200,authorization?await withAccessPass(await session(headers,origin),origin):null);
      if(!anonymous.has(route)&&(!authorization||!await session(headers,origin)))return json(401,{message:'Sign in first'});
      let body;
      if(request.method==='POST'){
        if(!String(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return json(415,{message:'Use application/json'});
        if(Number(request.headers.get('content-length')||0)>16384)return json(413,{message:'Request too large'});
        const reader=request.body?.getReader();let bytes=0;const chunks=[];
        if(reader){while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>16384){reader.cancel().catch(()=>{});return json(413,{message:'Request too large'});}chunks.push(value);}}
        try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return json(400,{message:'Invalid JSON'});}
        if(!body||typeof body!=='object'||Array.isArray(body))return json(400,{message:'Expected an object'});
      }
      const remember=body?.rememberMe===true;
      if(body?.app!==undefined&&(route.startsWith('sign-in/')||route==='sign-up/email'||route==='email-otp/verify-email'||route==='phone-number/verify')){
        let app;try{app=normalizeAppInfo(origin,body.app);}catch{return json(400,{message:'Use a valid app name and same-origin path.'});}
        headers.set('x-king-auth-app',encodeURIComponent(JSON.stringify(app)));
      }
      if(body)body=Object.fromEntries(rule[1].filter(key=>body[key]!==undefined&&key!=='persistent').map(key=>[key,body[key]]));
      if(route==='reauthenticate'||route==='reauthentication/consume')body.origin=origin;
      if(route==='change-password')body.revokeOtherSessions=true;
      if(route.startsWith('sign-in/')||route==='sign-up/email'||route==='email-otp/verify-email')headers.delete('Authorization');
      if(body)headers.set('Content-Type','application/json');
      const response=await auth.handler(new Request(config.baseURL+'/api/auth/'+route,{method:rule[0],headers,body:body?JSON.stringify(body):undefined}));
      let data=publicData(await response.json());
      const token=route==='reauthenticate'||route==='reauthentication/consume'?null:response.headers.get('set-auth-token');
      if(response.ok&&token){
        headers.set('Authorization','Bearer '+token);headers.delete('Content-Type');
        if(route==='email-otp/verify-email'){
          const duration=await auth.handler(new Request(config.baseURL+'/api/auth/account/session-duration',{method:'POST',headers:new Headers([...headers,['Content-Type','application/json']]),body:JSON.stringify({seconds:remember?94608000:86400})}));
          if(!duration.ok)throw Error('Could not apply session duration');
        }
        const current=await session(headers,origin);if(!current)throw Error('Invalid new session');
        const granted=await withAccessPass(current,origin);
        data={...data,browserSession:{token,expiresAt:current.session.expiresAt},accessPass:granted?.accessPass};
      }
      const retry=response.headers.get('retry-after')||response.headers.get('x-retry-after');
      return json(response.status,data,retry?{'Retry-After':retry}:{});
    }catch(error){
      if(error instanceof SessionRateLimitError){
        const retry=error.response.headers.get('retry-after')||error.response.headers.get('x-retry-after');
        const data=await error.response.json().catch(()=>({message:'Too many requests. Please try again later.'}));
        return json(429,publicData(data),retry?{'Retry-After':retry}:{});
      }
      return json(503,{message:'Authentication is temporarily unavailable. Please try again.'});
    }
  };
}
