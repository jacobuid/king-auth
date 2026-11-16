import {createHash,randomBytes} from 'node:crypto';
import {createAuthEndpoint,sensitiveSessionMiddleware,APIError} from 'better-auth/api';
import {z} from 'zod';

const action=z.string().min(1).max(128).regex(/^[a-zA-Z0-9:./_-]+$/);
const origin=z.string().refine(value=>{try{const url=new URL(value);return url.origin===value&&(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)));}catch{return false;}},'Use an exact HTTPS site origin');
const hash=value=>createHash('sha256').update(value).digest('hex');
const deny=(ctx,code='REAUTHENTICATION_FAILED')=>{throw new APIError('FORBIDDEN',{allowed:false,code,message:'Sorry, you cannot access this page or perform this action.'});};

// Separate from sign-in: no session renewal, sign-in counters, lockout or logout.
export function reauthenticationPlugin(){
  async function attempt(ctx){
    const key='king-reauth:'+ctx.context.session.session.id,adapter=ctx.context.adapter;
    for(let retry=0;retry<10;retry++){
      const row=await adapter.findOne({model:'rateLimit',where:[{field:'key',value:key}]});const now=Date.now();
      if(!row){try{await adapter.create({model:'rateLimit',data:{key,count:1,lastRequest:now}});return true;}catch{continue;}}
      const fresh=now-Number(row.lastRequest)>=60000;
      if(!fresh&&row.count>=5)return false;
      const updated=await adapter.update({model:'rateLimit',where:[{field:'id',value:row.id},{field:'count',value:row.count},{field:'lastRequest',value:row.lastRequest}],update:{count:fresh?1:row.count+1,lastRequest:fresh?now:row.lastRequest}});
      if(updated)return true;
    }
    return false;
  }
  function matchesOrigin(ctx){const bound=ctx.headers?.get('x-king-auth-browser-origin');return !bound||bound===ctx.body.origin;}
  return {id:'king-reauthentication',endpoints:{
    reauthenticate:createAuthEndpoint('/reauthenticate',{method:'POST',use:[sensitiveSessionMiddleware],body:z.object({password:z.string().min(1).max(128),action,origin})},async ctx=>{
      if(!matchesOrigin(ctx))return deny(ctx);
      if(!await attempt(ctx))throw new APIError('TOO_MANY_REQUESTS',{allowed:false,code:'REAUTHENTICATION_RATE_LIMITED',message:'Too many confirmation attempts. Try again in a minute.'});
      const {session,user}=ctx.context.session;
      const account=await ctx.context.internalAdapter.findCredentialAccount(user.id);
      if(!account?.password||!await ctx.context.password.verify({hash:account.password,password:ctx.body.password}))return deny(ctx);
      const proof=randomBytes(32).toString('base64url');
      const expiresAt=new Date(Math.min(Date.now()+300000,new Date(session.expiresAt).getTime()));
      await ctx.context.internalAdapter.createVerificationValue({identifier:'reauth-proof:'+hash(proof),value:JSON.stringify({userId:user.id,sessionId:session.id,action:ctx.body.action,origin:ctx.body.origin}),expiresAt});
      return ctx.json({proof,action:ctx.body.action,expiresAt:expiresAt.toISOString()});
    }),
    consumeReauthentication:createAuthEndpoint('/reauthentication/consume',{method:'POST',use:[sensitiveSessionMiddleware],body:z.object({proof:z.string().regex(/^[A-Za-z0-9_-]{43}$/),action,origin})},async ctx=>{
      if(!matchesOrigin(ctx))return deny(ctx,'REAUTHENTICATION_REQUIRED');
      const identifier='reauth-proof:'+hash(ctx.body.proof),adapter=ctx.context.internalAdapter;
      const candidate=await adapter.findVerificationValue(identifier);
      let value;try{value=JSON.parse(candidate?.value||'null');}catch{}
      const active=ctx.context.session;
      if(!value||value.userId!==active.user.id||value.sessionId!==active.session.id||value.origin!==ctx.body.origin||value.action!==ctx.body.action)return deny(ctx,'REAUTHENTICATION_REQUIRED');
      // Atomic consumption makes concurrent/repeated use fail closed. Incorrect
      // action/origin/session does not consume another operation's valid proof.
      if(!await adapter.consumeVerificationValue(identifier))return deny(ctx,'REAUTHENTICATION_REQUIRED');
      return ctx.json({allowed:true,userId:active.user.id,sessionId:active.session.id,action:ctx.body.action});
    }),
  }};
}
