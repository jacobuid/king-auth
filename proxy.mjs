import { createHash } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';

const MAX_SECONDS = 3 * 365 * 86400;
const BROWSER_COOKIE_SECONDS = 400 * 86400;
const routes = new Map([
  ['get-session', ['GET', []]], ['sign-out', ['POST', []]],
  ['sign-in/email', ['POST', ['email','password','rememberMe']]],
  ['sign-in/username', ['POST', ['username','password','rememberMe']]],
  ['sign-in/phone-number', ['POST', ['phoneNumber','password','rememberMe']]],
  ['sign-up/email', ['POST', ['name','email','username','password','rememberMe']]],
  ['email-otp/send-verification-otp', ['POST', ['email','type']]],
  ['email-otp/verify-email', ['POST', ['email','otp']]],
  ['email-otp/request-password-reset', ['POST', ['email']]],
  ['email-otp/reset-password', ['POST', ['email','otp','password']]],
  ['email-otp/request-email-change', ['POST', ['newEmail','otp']]],
  ['email-otp/change-email', ['POST', ['newEmail','otp']]],
  ['phone-number/send-otp', ['POST', ['phoneNumber']]],
  ['phone-number/verify', ['POST', ['phoneNumber','code','updatePhoneNumber','disableSession']]],
  ['phone-number/request-password-reset', ['POST', ['phoneNumber']]],
  ['phone-number/reset-password', ['POST', ['phoneNumber','otp','newPassword']]],
  ['update-user', ['POST', ['username','name']]],
  ['change-password', ['POST', ['currentPassword','newPassword','revokeOtherSessions']]],
  ['account/session-duration', ['POST', ['seconds','persistent']]],
  ['account/sessions', ['GET', []]],
  ['account/revoke-session', ['POST', ['sessionId']]],
  ['revoke-other-sessions', ['POST', []]],
]);
const loopback = url => ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
const safeUser = user => user && ({ id:user.id, name:user.name, email:user.email, emailVerified:user.emailVerified, username:user.username, phoneNumber:user.phoneNumber, phoneNumberVerified:user.phoneNumberVerified });
const safeSession = data => data?.user?.emailVerified ? { user:safeUser(data.user), session:{ id:data.session.id, createdAt:data.session.createdAt, expiresAt:data.session.expiresAt } } : null;
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!['token','access_token','refresh_token','id_token','password','secret'].includes(key)).map(([key,item])=>[key,clean(item)]));
}

/** Same-origin backend adapter. Never import this file into a browser bundle. */
export function createKingAuthProxy({ origin, secret, issuer='https://kingauth.app/api/auth', basePath='/auth/api', allowLocalhost=false, fetch:send=globalThis.fetch }) {
  const site = new URL(origin); const provider = new URL(issuer);
  if (site.origin !== origin || site.username || site.password) throw Error('origin must be your exact website origin');
  for (const url of [site,provider]) if (url.protocol!=='https:' && !(allowLocalhost && loopback(url))) throw Error('HTTPS is required');
  if (!secret || secret.length<32) throw Error('Set a unique server-side session secret of at least 32 random characters');
  if (!/^\/[a-zA-Z0-9/_-]+$/.test(basePath) || basePath.endsWith('/')) throw Error('Use an absolute basePath without a trailing slash');
  const key = createHash('sha256').update(secret).digest();
  const cookieName = site.protocol==='https:' ? '__Host-kingauth' : 'kingauth';
  const issuerName=site.origin+'/king-auth-session';
  const audience=provider.href.replace(/\/$/,'');
  const localCookie = req => String(req.headers.cookie || '').split(';').map(part=>part.trim()).find(part=>part.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  async function read(req) {
    const token=localCookie(req); if(!token)return null;
    try { const {payload}=await jwtDecrypt(token,key,{issuer:issuerName,audience});return payload; } catch { return null; }
  }
  function putCookie(res,value,maxAge) {
    const cookie=cookieName+'='+value+'; Path=/; HttpOnly; SameSite=Lax'+(site.protocol==='https:'?'; Secure':'')+(maxAge===undefined?'':'; Max-Age='+maxAge);
    const old=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',[...(old?(Array.isArray(old)?old:[old]):[]),cookie]);
  }
  async function save(res,state) {
    if(!state){putCookie(res,'',0);return;}
    const expires=Math.min(state.expires || Math.floor(Date.now()/1000)+MAX_SECONDS,Math.floor(Date.now()/1000)+MAX_SECONDS);
    const token=await new EncryptJWT({jar:state.jar,remember:!!state.remember}).setProtectedHeader({alg:'dir',enc:'A256GCM'}).setIssuer(issuerName).setAudience(audience).setIssuedAt().setExpirationTime(expires).encrypt(key);
    if(token.length>3800)throw Error('Session cookie exceeds supported size');
    putCookie(res,token,state.remember?Math.max(0,Math.min(BROWSER_COOKIE_SECONDS,expires-Math.floor(Date.now()/1000))):undefined);
  }
  function mergeCookies(state,response) {
    for(const value of response.headers.getSetCookie()) {
      const [pair,...attributes]=value.split(';');const at=pair.indexOf('=');const name=pair.slice(0,at);if(!/^(?:(?:__Secure|__Host)-)?better-auth\.[\w.-]+$/.test(name))continue;
      if(attributes.some(part=>/^\s*max-age=0\s*$/i.test(part)))delete state.jar[name];else state.jar[name]=pair.slice(at+1);
    }
  }
  async function upstream(route,state,body) {
    const headers={Origin:provider.origin,...(body?{'Content-Type':'application/json'}:{})};
    if(state?.jar)headers.Cookie=Object.entries(state.jar).map(([name,value])=>name+'='+value).join('; ');
    const response=await send(audience+'/'+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(state)mergeCookies(state,response);
    const data=await response.json();return {response,data};
  }
  async function session(req,res) {
    if(res)res.setHeader('Cache-Control','no-store');
    const state=await read(req);if(!state){if(res&&localCookie(req))putCookie(res,'',0);return null;}
    if(!Object.keys(state.jar||{}).some(name=>name.endsWith('.session_token')))return null;
    const {response,data}=await upstream('get-session',state);
    if(!response.ok)throw Error('King Auth session verification unavailable');
    const verified=safeSession(data);
    if(!verified){if(res)putCookie(res,'',0);return null;}
    state.expires=Math.min(state.exp,Math.floor(new Date(data.session.expiresAt).getTime()/1000));
    verified.session.expiresAt=new Date(state.expires*1000).toISOString();
    if(res)await save(res,state);
    return verified;
  }
  function respond(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
  async function handler(req,res,next) {
    const pathname=new URL(req.url,site).pathname;
    if(!pathname.startsWith(basePath+'/')){if(next)return next();return respond(res,404,{message:'Not found'});}
    const route=pathname.slice(basePath.length+1);const rule=routes.get(route);
    if(!rule)return respond(res,404,{message:'Not found'});
    if(req.method!==rule[0])return respond(res,405,{message:'Method not allowed'});
    if((req.method==='POST' && req.headers.origin!==site.origin)||(req.headers.origin&&req.headers.origin!==site.origin))return respond(res,403,{message:'Invalid origin'});
    try {
      if(route==='get-session')return respond(res,200,await session(req,res));
      if(req.method==='GET'){
        const state=await read(req);
        if(!state)return respond(res,401,{message:'Sign in first'});
        const {response,data}=await upstream(route,state);
        return respond(res,response.status,clean(data));
      }
      if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))return respond(res,415,{message:'Use application/json'});
      let body;
      if(req.body!==undefined)body=req.body;
      else{let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384)return respond(res,413,{message:'Request too large'});}try{body=JSON.parse(raw);}catch{return respond(res,400,{message:'Invalid JSON'});}}
      if(!body||typeof body!=='object'||Array.isArray(body))return respond(res,400,{message:'Expected a JSON object'});
      if(Buffer.byteLength(JSON.stringify(body))>16384)return respond(res,413,{message:'Request too large'});
      body=Object.fromEntries(rule[1].filter(key=>body[key]!==undefined).map(key=>[key,body[key]]));
      if(route==='change-password')body.revokeOtherSessions=true;
      const state=await read(req)||{jar:{},remember:false};state.expires=state.exp;
      if(route==='account/session-duration'){
        state.remember=body.persistent!==false;
        delete body.persistent;
      }
      if(route.startsWith('sign-in/')||route==='sign-up/email'){state.jar={};delete state.exp;state.expires=undefined;state.remember=body.rememberMe===true;body.rememberMe=state.remember;}
      const {response,data}=await upstream(route,state,body);
      if(response.ok){
        if(route==='sign-out')putCookie(res,'',0);
        else {
          if(route==='email-otp/verify-email'){
            delete state.exp;state.expires=undefined;
            const duration=await upstream('account/session-duration',state,{seconds:state.remember?MAX_SECONDS:86400});
            if(!duration.response.ok)throw Error('Session duration could not be applied');
          }
          if(route==='account/session-duration'){state.expires=Math.floor(new Date(data.expiresAt).getTime()/1000);delete state.exp;}
          const check=await upstream('get-session',state);
          if(!check.response.ok)throw Error('Session check failed');
          if(check.data?.session){state.expires=Math.min(state.expires||Infinity,Math.floor(new Date(check.data.session.expiresAt).getTime()/1000),Math.floor(Date.now()/1000)+(state.remember?MAX_SECONDS:86400));}
          // Keep the signup persistence choice briefly while waiting for verification.
          else state.expires=Math.min(state.expires||Infinity,Math.floor(Date.now()/1000)+1800);
          await save(res,state);
        }
      }
      const retry=response.headers.get('retry-after');if(retry)res.setHeader('Retry-After',retry);
      return respond(res,response.status,clean(data));
    }catch {return respond(res,502,{message:'Authentication service unavailable. Please try again.'});}
  }
  return {handler,getSession:session,async isSignedIn(req){return Boolean(await session(req));}};
}
