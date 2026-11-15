import {createHmac,timingSafeEqual} from 'node:crypto';
import {APIError} from 'better-auth/api';

// Enforce audience before any engine middleware can read a browser session.
// Checking only the public get-session response would leave other raw APIs open.
export async function enforceBrowserSessionOrigin(ctx,config){
  const candidates=[];const authorization=ctx.headers?.get('authorization');
  if(authorization?.toLowerCase().startsWith('bearer '))candidates.push(authorization.slice(7).trim());
  for(const entry of (ctx.headers?.get('cookie')||'').split(';')){
    const index=entry.indexOf('=');if(index<0)continue;
    if(/^(?:(?:__Secure|__Host)-)?better-auth\.session_token$/.test(entry.slice(0,index).trim()))candidates.push(entry.slice(index+1).trim());
  }
  for(const candidate of candidates){
    let value;try{value=decodeURIComponent(candidate);}catch{continue;}
    const parts=value.split('.');if(parts.length!==2)continue;
    const signature=createHmac('sha256',config.secret).update(parts[0]).digest();const provided=Buffer.from(parts[1],'base64');
    if(signature.length!==provided.length||!timingSafeEqual(signature,provided))continue;
    const record=await ctx.context.adapter.findOne({model:'session',where:[{field:'token',value:parts[0]}]});
    if(record?.browserOrigin&&record.browserOrigin!==ctx.headers?.get('x-king-auth-browser-origin'))throw new APIError('UNAUTHORIZED',{message:'This session belongs to another website.'});
  }
}
