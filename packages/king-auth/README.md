# King Auth integration

This package connects your website to the shared user pool at kingauth.app. Credentials and account changes are handled on the central domain; components intentionally navigate there rather than collecting passwords on third-party sites.

The package is prepared locally but is not published to npm yet. From this repository, run `npm pack --workspace @jacobuid/king-auth` and install the resulting tarball in your app.

```jsx
import { AuthProvider, SignInButton, AccountSettings, useAuth } from '@jacobuid/king-auth/react';

function App() {
  return <AuthProvider>
    <SignInButton />
    <AccountSettings />
  </AuthProvider>;
}
```

The consuming backend must implement `/auth/login`, `/auth/callback`, and `/auth/session`. Register its exact callback URL with King Auth first. React components do not authorize backend requests.

```js
import { createKingAuth } from '@jacobuid/king-auth/server';
const kingAuth = await createKingAuth({
  clientId: process.env.KING_AUTH_CLIENT_ID,
  clientSecret: process.env.KING_AUTH_CLIENT_SECRET,
  redirectUri: 'https://your-site.example/auth/callback',
});

// GET /auth/login: store transaction in the user's server-side session,
// save the session, then redirect to url.
const { url, transaction } = await kingAuth.begin();

// GET /auth/callback: load and DELETE transaction from that session before
// exchanging the code. Pass the full absolute callback URL.
const user = await kingAuth.complete(callbackURL, transaction);
// Regenerate the local session ID, store user, save, and redirect home.

// GET /auth/session: return { user } from the local session (or null).
```

Use a production session store and Secure, HttpOnly, SameSite=Lax cookies. Consume each transaction once, expire it after ten minutes, and regenerate the session on sign-in. Use the permanent `user.id` for your application data. Each site controls its own membership and authorization. Do not return OAuth tokens or client secrets to React or put them in localStorage.

Other React exports: `SignIn`, `ChangeEmail`, `ChangePhone`, `ChangeUsername`, `ChangePassword`, `ForgotPassword`, `ResetPassword`. `useAuth()` returns `user`, `loading`, and `error`. Style links using normal `className`/`style` props.

Signing out of a consuming site should clear that site's session through a CSRF-protected POST. Signing out at King Auth does not automatically end sessions already established on other sites.
