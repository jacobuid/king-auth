import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {createAuthEndpoint,APIError} from 'better-auth/api';
import {z} from 'zod';

const hash=token=>createHash('sha256').update(token).digest('hex');
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const review=z.object({userId:z.string().uuid(),decision:z.enum(['approve','deny']),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)});
const page=(message,content='',status=200)=>new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Signup review</title><h1>'+escape(message)+'</h1>'+content+'</html>',{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});

export function approvalPolicy(config,sender){
  const required=config.approval.required;
  const fields={
    // Existing accounts are preserved; the creation hook makes new accounts pending.
    approvalStatus:{type:'string',defaultValue:'approved',input:false},
    approvalApproveHash:{type:'string',required:false,input:false,returned:false},
    approvalDenyHash:{type:'string',required:false,input:false,returned:false},
    approvalExpiresAt:{type:'date',required:false,input:false,returned:false},
  };
  async function checked(ctx,values){
    if(!required)throw new APIError('NOT_FOUND',{message:'Review unavailable.'});
    const user=await ctx.context.internalAdapter.findUserById(values.userId);
    const saved=user?.[values.decision==='approve'?'approvalApproveHash':'approvalDenyHash'];
    const valid=typeof saved==='string'&&saved.length===64&&timingSafeEqual(Buffer.from(saved,'hex'),Buffer.from(hash(values.token),'hex'));
    if(!user||!valid||user.approvalStatus!=='pending'||new Date(user.approvalExpiresAt).getTime()<=Date.now())throw new APIError('BAD_REQUEST',{message:'This review link is invalid, expired, or already used.'});
    return user;
  }
  return {
    fields,
    userCreate:{
      before:async user=>({data:{...user,approvalStatus:required?'pending':'approved'}}),
      after:async(user,ctx)=>{
        if(!required)return;
        const approve=randomBytes(32).toString('base64url'),deny=randomBytes(32).toString('base64url');
        await ctx.context.internalAdapter.updateUser(user.id,{approvalApproveHash:hash(approve),approvalDenyHash:hash(deny),approvalExpiresAt:new Date(Date.now()+7*86400000)});
        const link=(decision,token)=>config.baseURL+'/api/auth/signup-review?'+new URLSearchParams({userId:user.id,decision,token});
        await sender.signupRequest({ownerEmail:config.approval.reviewEmails,email:user.email,userId:user.id,approveURL:link('approve',approve),denyURL:link('deny',deny)});
      },
    },
    async checkSession(userId,ctx){
      if(!required)return;
      const user=await ctx.context.internalAdapter.findUserById(userId);
      if(user?.approvalStatus!=='approved')throw new APIError('FORBIDDEN',{code:'SIGNUP_APPROVAL_REQUIRED',message:'This account has not been approved by the owner yet.'});
    },
    plugin:{id:'king-signup-approval',endpoints:{
      signupReview:createAuthEndpoint('/signup-review',{method:'GET',query:review},async ctx=>{
        const user=await checked(ctx,ctx.query);
        const inputs=Object.entries(ctx.query).map(([name,value])=>'<input type="hidden" name="'+name+'" value="'+escape(value)+'">').join('');
        return page('Confirm signup decision','<p>'+escape(user.email)+'</p><p>Account ID: '+escape(user.id)+'</p><form method="post" action="/api/auth/signup-review/confirm">'+inputs+'<button type="submit">'+(ctx.query.decision==='approve'?'Approve signup':'Deny signup')+'</button></form>');
      }),
      confirmSignup:createAuthEndpoint('/signup-review/confirm',{method:'POST',body:review,metadata:{allowedMediaTypes:['application/x-www-form-urlencoded','application/json']}},async ctx=>{
        await checked(ctx,ctx.body);
        // Compare-and-set: concurrent approve/deny submissions cannot reverse a decision.
        const updated=await ctx.context.adapter.update({model:'user',where:[{field:'id',value:ctx.body.userId},{field:'approvalStatus',value:'pending'}],update:{approvalStatus:ctx.body.decision==='approve'?'approved':'denied',approvalApproveHash:null,approvalDenyHash:null,approvalExpiresAt:null}});
        if(!updated)throw new APIError('BAD_REQUEST',{message:'This signup was already reviewed.'});
        return page(ctx.body.decision==='approve'?'Signup approved. The user can sign in after verifying their email.':'Signup denied. The account cannot sign in.');
      }),
    }},
  };
}
