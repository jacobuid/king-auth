import { betterAuth } from 'better-auth';
import { createAuthMiddleware, createAuthEndpoint, freshSessionMiddleware, sessionMiddleware, APIError, getSessionFromCtx } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';
import { emailOTP, phoneNumber, username, jwt, bearer } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';
import { approvalPolicy } from './approval.mjs';
import { abusePolicy } from './abuse.mjs';
import {enforceBrowserSessionOrigin} from './session-origin.mjs';
import {validNewPassword,PASSWORD_MESSAGE} from '../packages/king-auth/password-policy.mjs';
import {reauthenticationPlugin} from './reauthentication.mjs';
import {sessionDetails} from './session-details.mjs';
import {createSessionLocator} from './session-location.mjs';

export function createAuth({ config, database, sender, locateSession=createSessionLocator({enabled:config.sessionGeolocation===true}) }) {
  const isAdmin = user => Boolean(user && config.adminIds.includes(user.id) && user.emailVerified);
  const approval=approvalPolicy(config,sender);
  const abuse=abusePolicy(config,sender);
  return betterAuth({
    appName: 'King Auth', baseURL: config.baseURL, basePath: '/api/auth', secret: config.secret, database,
    trustedOrigins: [config.baseURL], disabledPaths: ['/token', '/change-email'],
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, requireEmailVerification: true, revokeSessionsOnPasswordReset: true },
    user:{additionalFields:{...approval.fields,...abuse.fields}},
    emailVerification: { autoSignInAfterVerification: !config.approval.required },
    // Remembered sessions have a fixed three-year ceiling, not an endless sliding expiry.
    // HTTP cookies are limited to 400 days by the serializer/browser. The database
    // is authoritative and may retain remembered sessions for up to three years.
    session: { expiresIn: 400 * 86400, disableSessionRefresh: true, freshAge: 600, storeSessionInDatabase: true,additionalFields:{browserOrigin:{type:'string',required:false,input:false,returned:false}} },
    databaseHooks: {user:{create:approval.userCreate},session:{create:{before:async(session,ctx)=>{
      await approval.checkSession(session.userId,ctx);
      await abuse.checkSession(session.userId,ctx);
      const created=new Date(session.createdAt).getTime();
      const remembered=new Date(session.expiresAt).getTime()-created>2*86400000;
      return {data:{...session,browserOrigin:ctx?.headers?.get('x-king-auth-browser-origin')||null,expiresAt:new Date(created+(remembered?3*365*86400000:86400000))}};
    }}}},
    advanced: { useSecureCookies: config.production, database: { generateId: 'uuid' }, ipAddress: { ipAddressHeaders: ['x-king-auth-client-ip'] } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60, customRules: {
      '/sign-in/*': { window: 60, max: 5 }, '/sign-up/*': { window: 60, max: 3 },
      '/email-otp/*': { window: 60, max: 5 }, '/phone-number/*': { window: 60, max: 5 },
      '/sign-in-code/send':{window:60,max:5},
      '/reauthenticate':{window:60,max:5},
    } },
    hooks: { before: createAuthMiddleware(async ctx => {
      await enforceBrowserSessionOrigin(ctx,config);
      if(ctx.path==='/sign-up/email' && ctx.body?.website)throw new APIError('BAD_REQUEST',{message:'Unable to create account.'});
      const passwordField=({'/sign-up/email':'password','/change-password':'newPassword','/set-password':'newPassword','/reset-password':'newPassword','/email-otp/reset-password':'password','/phone-number/reset-password':'newPassword'})[ctx.path];
      if(passwordField&&!validNewPassword(ctx.body?.[passwordField]))throw new APIError('BAD_REQUEST',{code:'PASSWORD_POLICY',message:PASSWORD_MESSAGE});
      await abuse.before(ctx);
      if (!sender.emailEnabled && (ctx.path === '/sign-up/email' || ctx.path.startsWith('/email-otp/'))) {
        throw new APIError('SERVICE_UNAVAILABLE', { message: 'Email delivery is not configured yet. Contact the site owner.' });
      }
      if (!sender.smsEnabled && ctx.path.startsWith('/phone-number/')) {
        throw new APIError('SERVICE_UNAVAILABLE', { message: 'SMS delivery is not configured yet. Contact the site owner.' });
      }
      const sensitive = ctx.path === '/update-user' || ctx.path === '/email-otp/request-email-change' || ctx.path === '/email-otp/change-email' || (ctx.path === '/phone-number/verify' && ctx.body?.updatePhoneNumber);
      if (sensitive) {
        const active = await getSessionFromCtx(ctx);
        if (!active || Date.now() - new Date(active.session.createdAt).getTime() > 600000) {
          throw new APIError('UNAUTHORIZED', { message: 'Please sign in again before changing your account.' });
        }
      }
    }),after:createAuthMiddleware(async ctx=>{
      const result=await abuse.after(ctx);if(result!==undefined)return result;
      if(ctx.path==='/get-session'&&ctx.context.returned?.session){
        const session=await ctx.context.adapter.findOne({model:'session',where:[{field:'id',value:ctx.context.returned.session.id}]});
        if(session?.browserOrigin&&session.browserOrigin!==ctx.headers?.get('x-king-auth-browser-origin'))return ctx.json(null);
      }
    }) },
    plugins: [
      bearer({requireSignature:true}),
      reauthenticationPlugin(),
      approval.plugin,
      abuse.plugin,
      { id: 'king-account', endpoints: {
        sessionDuration: createAuthEndpoint('/account/session-duration', {
          method:'POST', use:[freshSessionMiddleware],
          body:z.object({seconds:z.number().int().min(60).max(3*365*86400)}),
        }, async ctx=>{
          const {session,user}=ctx.context.session;
          const expiresAt=new Date(Math.min(Date.now()+ctx.body.seconds*1000,new Date(session.createdAt).getTime()+3*365*86400000));
          const updated=await ctx.context.internalAdapter.updateSession(session.token,{expiresAt,updatedAt:new Date()});
          if(!updated)throw new APIError('UNAUTHORIZED',{message:'Sign in again.'});
          await setSessionCookie(ctx,{session:updated,user},false,{maxAge:Math.max(0,Math.min(400*86400,Math.floor((expiresAt.getTime()-Date.now())/1000)))});
          return ctx.json({expiresAt:expiresAt.toISOString()});
        }),
        accountSessions: createAuthEndpoint('/account/sessions',{method:'GET',use:[sessionMiddleware]},async ctx=>{
          const current=ctx.context.session.session;
          const sessions=await ctx.context.internalAdapter.listSessions(ctx.context.session.user.id,{onlyActiveSessions:true});
          return ctx.json(await Promise.all(sessions.map(async item=>({id:item.id,createdAt:item.createdAt,expiresAt:item.expiresAt,userAgent:item.userAgent,...sessionDetails(item),location:await locateSession(item.ipAddress).catch(()=>null),current:item.id===current.id}))));
        }),
        accountRevoke: createAuthEndpoint('/account/revoke-session',{
          method:'POST',use:[freshSessionMiddleware],body:z.object({sessionId:z.string().min(1).max(128)}),
        },async ctx=>{
          const sessions=await ctx.context.internalAdapter.listSessions(ctx.context.session.user.id,{onlyActiveSessions:true});
          const session=sessions.find(item=>item.id===ctx.body.sessionId);
          if(!session)throw new APIError('NOT_FOUND',{message:'Session not found.'});
          await ctx.context.internalAdapter.deleteSession(session.token);
          return ctx.json({success:true});
        }),
      } },
      username({ minUsernameLength: 3, maxUsernameLength: 30, usernameValidator: value => /^[a-zA-Z][a-zA-Z0-9_]{2,29}$/.test(value) }),
      emailOTP({ sendVerificationOTP: data => sender.email(data), sendVerificationOnSignUp: true, overrideDefaultEmailVerification: true, disableSignUp: true, storeOTP: 'hashed', allowedAttempts: 3, expiresIn: 300, changeEmail: { enabled: true, verifyCurrentEmail: true } }),
      phoneNumber({ sendOTP: data => sender.sms(data), sendPasswordResetOTP: data => sender.sms(data), requireVerification: true, phoneNumberValidator: value => /^\+[1-9]\d{7,14}$/.test(value), expiresIn: 300, allowedAttempts: 3 }),
      jwt({ disableSettingJwtHeader: true }),
      oauthProvider({
        loginPage: '/sign-in', consentPage: '/consent', signup: { page: '/sign-up' },
        scopes: ['openid', 'profile', 'email', 'offline_access'], grantTypes: ['authorization_code', 'refresh_token'],
        allowDynamicClientRegistration: false, allowUnauthenticatedClientRegistration: false,
        clientPrivileges: ({ user }) => isAdmin(user),
        customIdTokenClaims: ({ user, scopes }) => ({
          ...(scopes.includes('email') ? { email: user.email, email_verified: user.emailVerified } : {}),
          ...(scopes.includes('profile') ? { name: user.name, preferred_username: user.username } : {}),
        }),
        postLogin: { page: '/verify-email', shouldRedirect: ({ user }) => !user.emailVerified },
      }),
    ],
  });
}
