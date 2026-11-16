import {randomBytes,randomInt,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {createAuthEndpoint,APIError} from 'better-auth/api';
import {z} from 'zod';
import {validNewPassword,PASSWORD_PATTERN,PASSWORD_MESSAGE} from '../packages/king-auth/password-policy.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const encode=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const decision=z.object({userId:z.string().uuid(),action:z.enum(['unlock','delete','password']),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)});
const html=content=>new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Account security</title>'+content+'</html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
const fields={failedSignIns:{type:'number',defaultValue:0,input:false,returned:false},signInLocked:{type:'boolean',defaultValue:false,input:false,returned:false},lockReview:{type:'string',required:false,input:false,returned:false},lockReviewExpiresAt:{type:'date',required:false,input:false,returned:false},loginCodeSentAt:{type:'date',required:false,input:false,returned:false}};

export function abusePolicy(config,sender){
  const codeHash=(userId,code)=>createHmac('sha256',config.secret).update(userId+':'+code).digest('hex');
  const userById=(ctx,id)=>ctx.context.internalAdapter.findUserById(id);
  async function loginUser(ctx){
    if(ctx.path==='/sign-in/email')return (await ctx.context.internalAdapter.findUserByEmail(String(ctx.body?.email||'').trim().toLowerCase()))?.user;
    const field=ctx.path==='/sign-in/username'?'username':ctx.path==='/sign-in/phone-number'?'phoneNumber':null;
    return field&&ctx.body?.[field]?ctx.context.adapter.findOne({model:'user',where:[{field,value:field==='username'?ctx.body[field].toLowerCase():ctx.body[field]}]}):null;
  }
  async function revoke(ctx,id){const sessions=await ctx.context.internalAdapter.listSessions(id);if(sessions.length)await ctx.context.internalAdapter.deleteSessions(sessions.map(item=>item.token));}
  async function checked(ctx,input){
    const user=await userById(ctx,input.userId);let stored;try{stored=JSON.parse(user?.lockReview||'null')?.[input.action];}catch{}
    const valid=typeof stored==='string'&&stored.length===64&&timingSafeEqual(Buffer.from(stored,'hex'),Buffer.from(digest(input.token),'hex'));
    if(!user?.signInLocked||!valid||new Date(user.lockReviewExpiresAt).getTime()<=Date.now())throw new APIError('BAD_REQUEST',{message:'This security link is invalid, expired, or already used.'});
    return user;
  }
  return {fields,
    async checkSession(userId,ctx){if((await userById(ctx,userId))?.signInLocked)throw new APIError('FORBIDDEN',{code:'ACCOUNT_LOCKED',message:'This account is locked. The owner has been notified.'});},
    async before(ctx){
      if(!['/sign-in/email','/sign-in/username','/sign-in/phone-number'].includes(ctx.path))return;
      const user=await loginUser(ctx);if(!user)return;
      ctx.context.kingLoginId=user.id;
      if(user.signInLocked)throw new APIError('FORBIDDEN',{code:'ACCOUNT_LOCKED',message:'This account is locked. The owner has been notified.'});
      if(user.failedSignIns>=2){
        const code=ctx.body?.loginCode;
        const stored=typeof code==='string'&&/^[0-9]{6}$/.test(code)?await ctx.context.internalAdapter.consumeVerificationValue('login-email:'+user.id):null;
        let value;try{value=JSON.parse(stored?.value||'null');}catch{}
        const valid=value?.hash===codeHash(user.id,String(code));
        if(!valid){
          if(value&&value.attempts<2)await ctx.context.internalAdapter.createVerificationValue({identifier:'login-email:'+user.id,value:JSON.stringify({...value,attempts:value.attempts+1}),expiresAt:stored.expiresAt});
          throw new APIError('FORBIDDEN',{code:'EMAIL_CODE_REQUIRED',message:'Enter the code sent to your account email before trying again. Codes expire in 5 minutes and are single-use.'});
        }
      }
    },
    async after(ctx){
      const returned=ctx.context.returned;
      if(ctx.path==='/get-session'&&returned?.user){
        const user=await userById(ctx,returned.user.id);
        if(!user||user.signInLocked||(config.approval.required&&user.approvalStatus!=='approved'))return ctx.json(null);
      }
      if(!ctx.context.kingLoginId)return;
      if(returned?.user && !returned?.body?.code){
        const user=await userById(ctx,ctx.context.kingLoginId);
        if(user&&!user.signInLocked)await ctx.context.adapter.update({model:'user',where:[{field:'id',value:user.id},{field:'failedSignIns',value:user.failedSignIns},{field:'signInLocked',value:false}],update:{failedSignIns:0,loginCodeSentAt:null}});
        return;
      }
      if(!['INVALID_EMAIL_OR_PASSWORD','INVALID_USERNAME_OR_PASSWORD','INVALID_PHONE_NUMBER_OR_PASSWORD'].includes(returned?.body?.code))return;
      // Compare-and-set prevents parallel workers from losing failed attempts.
      for(let attempt=0;attempt<10;attempt++){
        const user=await userById(ctx,ctx.context.kingLoginId);
        if(!user||user.signInLocked||user.approvalStatus!=='approved')return;
        const count=Math.min(5,user.failedSignIns+1);const tokens=Object.fromEntries(['unlock','delete','password'].map(action=>[action,randomBytes(32).toString('base64url')]));
        const lock=count>=5;
        const update={failedSignIns:count,...(lock?{signInLocked:true,lockReview:JSON.stringify(Object.fromEntries(Object.entries(tokens).map(([action,token])=>[action,digest(token)]))),lockReviewExpiresAt:new Date(Date.now()+7*86400000)}:{})};
        const changed=await ctx.context.adapter.update({model:'user',where:[{field:'id',value:user.id},{field:'failedSignIns',value:user.failedSignIns},{field:'signInLocked',value:false}],update});
        if(!changed)continue;
        if(lock){
          await revoke(ctx,user.id);
          const links=Object.fromEntries(Object.entries(tokens).map(([action,token])=>[action,config.baseURL+'/api/auth/account-security?'+new URLSearchParams({userId:user.id,action,token})]));
          await sender.accountLocked({ownerEmail:config.approval.ownerEmail,email:user.email,userId:user.id,links});
          return ctx.json({code:'ACCOUNT_LOCKED',message:'This account is locked. The owner has been notified.'},{status:403});
        }
        if(count>=2)return ctx.json({code:'EMAIL_CODE_REQUIRED',message:'Incorrect password. An email verification code is required before another attempt.'},{status:403});
        return;
      }
      throw new APIError('TOO_MANY_REQUESTS',{message:'Please wait before trying again.'});
    },
    plugin:{id:'king-login-protection',endpoints:{
      loginCode:createAuthEndpoint('/sign-in-code/send',{method:'POST',body:z.object({email:z.email()})},async ctx=>{
        const user=(await ctx.context.internalAdapter.findUserByEmail(ctx.body.email.trim().toLowerCase()))?.user;
        if(user&&user.approvalStatus==='approved'&&!user.signInLocked&&user.failedSignIns>=2&&(!user.loginCodeSentAt||Date.now()-new Date(user.loginCodeSentAt).getTime()>=60000)){
          const claimed=await ctx.context.adapter.update({model:'user',where:[{field:'id',value:user.id},{field:'loginCodeSentAt',value:user.loginCodeSentAt||null}],update:{loginCodeSentAt:new Date()}});
          if(claimed){
            const otp=String(randomInt(0,1000000)).padStart(6,'0');
            await ctx.context.internalAdapter.deleteVerificationByIdentifier('login-email:'+user.id);
            await ctx.context.internalAdapter.createVerificationValue({identifier:'login-email:'+user.id,value:JSON.stringify({hash:codeHash(user.id,otp),attempts:0}),expiresAt:new Date(Date.now()+300000)});
            await sender.email({email:user.email,otp,type:'sign-in-verification'});
          }
        }
        return ctx.json({message:'If this account needs a sign-in code, one was sent. Wait one minute before requesting another.'});
      }),
      accountSecurity:createAuthEndpoint('/account-security',{method:'GET',query:decision},async ctx=>{
        const user=await checked(ctx,ctx.query);
        const hidden=Object.entries(ctx.query).map(([name,value])=>'<input type="hidden" name="'+name+'" value="'+encode(value)+'">').join('');
        const password=ctx.query.action==='password'?['password','confirmPassword'].map((name,index)=>'<p><label>'+(index?'Confirm new password':'New password')+' <input type="password" name="'+name+'" minlength="8" maxlength="128" pattern="'+encode(PASSWORD_PATTERN)+'" title="'+encode(PASSWORD_MESSAGE)+'" autocomplete="new-password" required></label></p>').join(''):'';
        return html('<h1>Confirm account security action</h1><p>'+encode(user.email)+'</p><p>Account ID: '+encode(user.id)+'</p><form method="post" action="/api/auth/account-security/confirm">'+hidden+password+'<button type="submit">'+({unlock:'Unlock account',delete:'Permanently delete account',password:'Set new password and unlock account'})[ctx.query.action]+'</button></form>');
      }),
      confirmAccountSecurity:createAuthEndpoint('/account-security/confirm',{method:'POST',body:decision.extend({password:z.string().min(8).max(128).optional(),confirmPassword:z.string().optional()}),metadata:{allowedMediaTypes:['application/x-www-form-urlencoded','application/json']}},async ctx=>{
        const user=await checked(ctx,ctx.body);
        if(ctx.body.action==='password'&&(!validNewPassword(ctx.body.password)||ctx.body.password!==ctx.body.confirmPassword))throw new APIError('BAD_REQUEST',{message:'Enter matching new passwords. '+PASSWORD_MESSAGE});
        const passwordHash=ctx.body.action==='password'?await ctx.context.password.hash(ctx.body.password):null;
        const changed=await ctx.context.adapter.update({model:'user',where:[{field:'id',value:user.id},{field:'lockReview',value:user.lockReview},{field:'signInLocked',value:true}],update:{lockReview:null,lockReviewExpiresAt:null,...(ctx.body.action==='unlock'?{signInLocked:false,failedSignIns:0}:{})}});
        if(!changed)throw new APIError('BAD_REQUEST',{message:'This account was already reviewed.'});
        if(ctx.body.action==='delete'){await ctx.context.internalAdapter.deleteUser(user.id);return html('<h1>Account permanently deleted</h1>');}
        if(passwordHash){await ctx.context.internalAdapter.updatePassword(user.id,passwordHash);await revoke(ctx,user.id);await ctx.context.internalAdapter.updateUser(user.id,{signInLocked:false,failedSignIns:0});}
        return html('<h1>'+ (passwordHash?'Password changed and account unlocked':'Account unlocked')+'</h1>');
      }),
    }},
  };
}
