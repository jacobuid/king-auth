import {AUTH_ROUTES} from './routes.mjs';
import {browserAppInfo} from './app-info.mjs';
/** Browser-only, cookie-free transport. Stored credentials are accessible to page JS. */
export function createBrowserClient({apiUrl='https://kingauth.app/api/browser',appName,appPath,fetch:send=globalThis.fetch}={}){
  const endpoint=new URL(apiUrl);const local=['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname);
  if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&local)))throw Error('Use an HTTPS King Auth API URL');
  const base=endpoint.href.replace(/\/$/,'');const appScope=browserAppInfo({appName,appPath});
  const key='king-auth:browser:'+base+(appScope?.path&&appScope.path!=='/'?':app:'+appScope.path:'');
  let memory=null,memoryOnly=false,pendingRemember=false;
  let access=null,renewing=null,retry=null;
  function clear(){memory=null;access=null;retry=null;for(const name of ['sessionStorage','localStorage'])try{globalThis[name]?.removeItem(key);}catch{}}
  function read(){
    let value;
    try{const raw=memoryOnly?null:globalThis.sessionStorage?.getItem(key)||globalThis.localStorage?.getItem(key);value=memoryOnly?memory:raw?JSON.parse(raw):null;}catch{value=memory;}
    if(!value?.token||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=Date.now()){if(value)clear();return null;}
    return value;
  }
  function save(value){
    memory=value;memoryOnly=false;
    try{
      const target=globalThis[value.remember?'localStorage':'sessionStorage'];if(!target)throw Error('Browser storage unavailable');
      target.setItem(key,JSON.stringify(value));globalThis[value.remember?'sessionStorage':'localStorage']?.removeItem(key);
    }catch{memoryOnly=true;}
  }
  async function request(route,body){
    if(AUTH_ROUTES.get(route)?.[0] !== (body===undefined?'GET':'POST'))throw Error('Unsupported auth operation');
    const previous=read();const signingIn=route.startsWith('sign-in/')||route==='sign-up/email';
    const remember=signingIn?body?.rememberMe===true:route==='account/session-duration'?body?.persistent!==false:previous?.remember??pendingRemember;
    if(['get-session','access-pass'].includes(route)&&!previous)return null;
    let payload=route==='email-otp/verify-email'?{...body,rememberMe:remember}:body;
    if(signingIn||route==='email-otp/verify-email'||route==='phone-number/verify'){
      const app=browserAppInfo({appName,appPath});
      if(app)payload={...payload,app};
    }
    const headers={...(body===undefined?{}:{'Content-Type':'application/json'}),...(previous?{Authorization:'Bearer '+previous.token}:{})};
    const response=await send(base+'/'+route,{method:body===undefined?'GET':'POST',credentials:'omit',headers,body:body===undefined?undefined:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(20000)});
    const data=await response.json();
    if(!response.ok){if(response.status===401&&previous&&read()?.token===previous.token&&!['reauthenticate','reauthentication/consume'].includes(route))clear();const error=new Error(data?.message||'Authentication request failed');error.code=data?.code;error.status=response.status;error.retryAfter=response.headers.get('retry-after');throw error;}
    if(signingIn)pendingRemember=remember;
    if(data?.browserSession){access=null;retry=null;save({token:data.browserSession.token,expiresAt:data.browserSession.expiresAt,remember});delete data.browserSession;}
    else if(route==='account/session-duration'&&previous)save({...previous,expiresAt:data.expiresAt,remember});
    else if(['get-session','access-pass'].includes(route)){
      // A late renewal must not restore a session that was signed out or replaced.
      if(read()?.token!==previous?.token)return null;
      if(!data?.user)clear();else if(previous)save({...previous,expiresAt:data.session.expiresAt});
    }
    if(body!==undefined&&!['reauthenticate','reauthentication/consume'].includes(route))access=null;
    if(data?.accessPass){
      const token=read()?.token;
      if(token)access={...data.accessPass,credential:token};
      delete data.accessPass;
    }
    if(route==='sign-out')clear();
    return data;
  }
  async function getAccessToken(){
    const credential=read()?.token;if(!credential)return null;
    if(access?.credential===credential&&Date.parse(access.expiresAt)>Date.now()+5000)return access.token;
    if(retry?.credential===credential&&retry.until>Date.now())throw retry.error;
    if(renewing?.credential===credential)return renewing.promise;
    const entry={credential};
    entry.promise=(async()=>{
      try{
        await request('access-pass');
        if(read()?.token!==credential)return null;
        if(!access?.token||access.credential!==credential||Date.parse(access.expiresAt)<=Date.now()){
          const error=new Error('No valid access pass returned');error.status=503;throw error;
        }
        retry=null;return access.token;
      }catch(error){
        const seconds=Number(error.retryAfter);
        const until=error.retryAfter?(Number.isFinite(seconds)?Date.now()+Math.max(0,seconds)*1000:Date.parse(error.retryAfter)):Date.now()+5000;
        if(read()?.token===credential)retry={credential,error,until:Number.isFinite(until)?Math.max(Date.now()+1000,until):Date.now()+5000};
        throw error;
      }finally{if(renewing===entry)renewing=null;}
    })();
    renewing=entry;return entry.promise;
  }
  return {request,getToken:()=>read()?.token||null,getAccessToken,getSession:()=>request('get-session'),async isSignedIn(){return Boolean((await request('get-session'))?.user);},signOut:()=>request('sign-out',{})};
}
