import {AUTH_ROUTES} from './routes.mjs';
/** Browser-only, cookie-free transport. Stored credentials are accessible to page JS. */
export function createBrowserClient({apiUrl='https://kingauth.app/api/browser',fetch:send=globalThis.fetch}={}){
  const endpoint=new URL(apiUrl);const local=['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname);
  if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&local)))throw Error('Use an HTTPS King Auth API URL');
  const base=endpoint.href.replace(/\/$/,'');const key='king-auth:browser:'+base;
  let memory=null,memoryOnly=false,pendingRemember=false;
  function clear(){memory=null;for(const name of ['sessionStorage','localStorage'])try{globalThis[name]?.removeItem(key);}catch{}}
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
    if(route==='get-session'&&!previous)return null;
    const payload=route==='email-otp/verify-email'?{...body,rememberMe:remember}:body;
    const headers={...(body===undefined?{}:{'Content-Type':'application/json'}),...(previous?{Authorization:'Bearer '+previous.token}:{})};
    const response=await send(base+'/'+route,{method:body===undefined?'GET':'POST',credentials:'omit',headers,body:body===undefined?undefined:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(20000)});
    const data=await response.json();
    if(!response.ok){if(response.status===401&&previous&&!['reauthenticate','reauthentication/consume'].includes(route))clear();const error=new Error(data?.message||'Authentication request failed');error.code=data?.code;error.status=response.status;throw error;}
    if(signingIn)pendingRemember=remember;
    if(data?.browserSession){save({token:data.browserSession.token,expiresAt:data.browserSession.expiresAt,remember});delete data.browserSession;}
    else if(route==='account/session-duration'&&previous)save({...previous,expiresAt:data.expiresAt,remember});
    else if(route==='get-session'){if(!data?.user)clear();else if(previous)save({...previous,expiresAt:data.session.expiresAt});}
    if(route==='sign-out')clear();
    return data;
  }
  return {request,getToken:()=>read()?.token||null,getSession:()=>request('get-session'),async isSignedIn(){return Boolean((await request('get-session'))?.user);},signOut:()=>request('sign-out',{})};
}
