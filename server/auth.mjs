import { betterAuth } from 'better-auth';
import { createAuthMiddleware, APIError, getSessionFromCtx } from 'better-auth/api';
import { emailOTP, phoneNumber, username, jwt } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';

export function createAuth({ config, database, sender }) {
  const isAdmin = user => Boolean(user && config.adminIds.includes(user.id) && user.emailVerified);
  return betterAuth({
    appName: 'King Auth', baseURL: config.baseURL, basePath: '/api/auth', secret: config.secret, database,
    trustedOrigins: [config.baseURL], disabledPaths: ['/token', '/change-email'],
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128, requireEmailVerification: true, revokeSessionsOnPasswordReset: true },
    emailVerification: { autoSignInAfterVerification: true },
    session: { expiresIn: 604800, updateAge: 86400, freshAge: 600, storeSessionInDatabase: true },
    advanced: { useSecureCookies: config.production, database: { generateId: 'uuid' }, ipAddress: { ipAddressHeaders: ['x-king-auth-client-ip'] } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60, customRules: {
      '/sign-in/*': { window: 60, max: 5 }, '/sign-up/*': { window: 60, max: 3 },
      '/email-otp/*': { window: 60, max: 5 }, '/phone-number/*': { window: 60, max: 5 },
    } },
    hooks: { before: createAuthMiddleware(async ctx => {
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
    }) },
    plugins: [
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
