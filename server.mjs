import * as oidc from 'openid-client';
export { createKingAuthProxy, createKingAuthProxy as createKingAuthServer } from './proxy.mjs';

/** Configure once per consuming backend. Transactions belong in its server-side session. */
export async function createKingAuth({ issuer = 'https://kingauth.app/api/auth', clientId, clientSecret, redirectUri, allowLocalhost = false }) {
  if (!clientId || !redirectUri) throw new Error('clientId and redirectUri are required');
  const provider = new URL(issuer);
  const callback = new URL(redirectUri);
  const local = url => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (provider.protocol !== 'https:' && !(allowLocalhost && local(provider))) throw new Error('Issuer must use HTTPS');
  if (callback.protocol !== 'https:' && !(allowLocalhost && local(callback))) throw new Error('Callback must use HTTPS');
  const configuration = await oidc.discovery(provider, clientId, undefined,
    clientSecret ? oidc.ClientSecretBasic(clientSecret) : oidc.None(),
    allowLocalhost && local(provider) ? { execute: [oidc.allowInsecureRequests] } : undefined);
  return {
    async begin({ createAccount = false } = {}) {
      const verifier = oidc.randomPKCECodeVerifier();
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const challenge = await oidc.calculatePKCECodeChallenge(verifier);
      const url = oidc.buildAuthorizationUrl(configuration, { redirect_uri: callback.href, scope: 'openid profile email', code_challenge: challenge, code_challenge_method: 'S256', state, nonce, ...(createAccount ? { prompt: 'create' } : {}) });
      return { url: url.href, transaction: { verifier, state, nonce, createdAt: Date.now() } };
    },
    async complete(callbackURL, transaction) {
      if (!transaction || !transaction.state || !transaction.nonce || !transaction.verifier || Date.now() - transaction.createdAt > 600000 || transaction.createdAt > Date.now()) throw new Error('Sign-in expired. Start again.');
      const incoming = new URL(callbackURL);
      if (incoming.origin !== callback.origin || incoming.pathname !== callback.pathname) throw new Error('Callback URL does not match configuration');
      const tokens = await oidc.authorizationCodeGrant(configuration, incoming, {
        pkceCodeVerifier: transaction.verifier, expectedState: transaction.state, expectedNonce: transaction.nonce, idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims?.sub || claims.email_verified !== true) throw new Error('A verified account is required');
      return { id: claims.sub, name: claims.name, email: claims.email, emailVerified: claims.email_verified };
    },
  };
}
