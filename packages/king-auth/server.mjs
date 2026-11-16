import * as oidc from 'openid-client';
export { createKingAuthProxy, createKingAuthProxy as createKingAuthServer } from './proxy.mjs';

/** Verify a browser bearer credential for this site's backend, without an adapter. */
export function createKingAuthVerifier({origin,apiUrl='https://kingauth.app/api/browser',allowLocalhost=false,fetch:send=globalThis.fetch}){
  const site=new URL(origin),endpoint=new URL(apiUrl);
  if(site.origin!==origin)throw Error('Use your exact site origin');
  for(const url of [site,endpoint])if(url.protocol!=='https:'&&!(allowLocalhost&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('HTTPS is required');
  async function getSession(request){
    const authorization=request.headers?.get?request.headers.get('authorization'):request.headers?.authorization;
    if(!authorization||!/^Bearer [^\s]+$/i.test(authorization))return null;
    const response=await send(endpoint.href.replace(/\/$/,'')+'/get-session',{headers:{Origin:origin,Authorization:authorization},redirect:'error',signal:AbortSignal.timeout(15000)});
    if(response.status===401)return null;
    if(!response.ok)throw Error('King Auth verification unavailable');
    return response.json();
  }
  async function verifyReauthentication(request,{proof,action}){
    const authorization=request.headers?.get?request.headers.get('authorization'):request.headers?.authorization;
    if(!authorization||!/^Bearer [^\s]+$/i.test(authorization))return false;
    const response=await send(endpoint.href.replace(/\/$/,'')+'/reauthentication/consume',{method:'POST',headers:{Origin:origin,Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify({proof,action}),redirect:'error',signal:AbortSignal.timeout(15000)});
    if([400,401,403,429].includes(response.status))return false;
    if(!response.ok)throw Error('King Auth verification unavailable');
    return (await response.json()).allowed===true;
  }
  return {getSession,verifyReauthentication,async isSignedIn(request){return Boolean((await getSession(request))?.user);}};
}

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
