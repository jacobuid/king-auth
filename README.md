# @jacobuid/king-auth

Unstyled React authentication forms backed by the shared King Auth user pool. Version 0.2.0 is prepared locally; it is not published to npm yet. Use `npm pack --workspace @jacobuid/king-auth` from the repository root, then install the tarball in your consuming app.

## Backend

```js
import {createKingAuthServer} from '@jacobuid/king-auth/server';
const auth=createKingAuthServer({
  origin:'https://your-site.example',
  secret:process.env.SESSION_SECRET, // unique random >=32 characters
});
app.use(auth.handler); // root mount, before your other handlers
```

Options: `origin` (exact site origin), `secret`, optional `issuer` (default `https://kingauth.app/api/auth`), `basePath` (default `/auth/api`), `allowLocalhost` (explicit development HTTP loopback only), and injectable `fetch`. Keep this module and secret on the backend. Rotating the secret invalidates this site's cookies. Use a different secret per site, shared across that site's instances.

`await auth.getSession(req,res)` returns `{user,session}` or `null`, and renews the cookie when appropriate. The result omits central session tokens. `await auth.isSignedIn(req)` returns a boolean. Both verify against King Auth on each call; service/network errors throw and must deny access. Always authorize server operations with these checks. Set private responses to `Cache-Control: no-store`; `getSession(req,res)` does this automatically.

The handler exposes an allowlist of `/auth/api/*` routes used by the forms, checks exact Origin and JSON for mutations, and uses an authenticated encrypted HttpOnly SameSite=Lax cookie (Secure and __Host-prefixed over HTTPS). Credentials go from your React forms to your backend and then King Auth over HTTPS. Never log request bodies or cookie headers. Your website is trusted with submitted credentials. No client ID/redirect registration or cross-origin browser-cookie access is required. A static-only React site needs a Node backend added first.

## React

```jsx
import {AuthProvider,SignIn,SignUp,Account,SignOut,useAuth} from '@jacobuid/king-auth';
function MyApp(){return <AuthProvider><MyRoutes /></AuthProvider>;}
function MyRoutes(){
  const {user,isSignedIn,isLoading,error,refresh}=useAuth();
  if(isLoading)return null;
  return isSignedIn ? <><p>{user.email}</p><Account /><SignOut /></> : <SignIn />;
}
```

`AuthProvider` accepts `basePath` matching your backend. `useAuth()` (alias `useSession()`) exposes `user`, `session`, `isSignedIn`, `isLoading`/`loading`, `error`, `refresh()`, and `signOut()`. It checks on mount and window focus. `call(route, body?)` is available for custom UI; omitting body makes a GET. `RequireAuth` accepts `children` and `fallback` for display only.

| Component | Purpose |
| --- | --- |
| `SignIn` | Email/password, optional remembered session |
| `SignUp` | Email/password/confirmation, then verification code; no phone or username |
| `VerifyEmail` | Code entry and resend; optional `email` |
| `SendCode` | Optional `email`, `purpose`: `email-verification` or `forget-password` |
| `ForgotPassword` | Email reset request then reset form |
| `ResetPassword` | Email, code, new/confirm password; optional `identifier` email |
| `ChangeEmail` | Proof of current and new email; UUID remains unchanged |
| `ChangePassword` | Current, new, confirm password; ends other sessions |
| `SessionSettings` | Current-device session lifetime, maximum three years |
| `Sessions` | List sessions, end one or all others; no bearer tokens exposed |
| `Account` / `AccountSettings` | Email, UUID, email/password/session controls, sign-out; sign-in if anonymous |
| `SignOut` | Unstyled button, optional children and normal button attributes |

Forms accept `className`, `style`, `submitLabel`, `onSuccess(data)`, and `onError(error)`. Account/Sessions accept `className`/`style`. SignOut accepts `onSuccess()`/`onError(error)`. Components use semantic HTML and accessible labels/announcements, no CSS or inline theme; style `.king-auth-form`, `.king-auth-fields`, `.king-auth-field`, `.king-auth-error`, `.king-auth-status` in your app. Inputs/buttons inherit your site's CSS. Caller-provided `style` is optional.

`ChangePhone` and `ChangeUsername` remain optional exports for compatibility; absent from default account UI. SMS is currently unavailable. `SignInButton` and `SignUpButton` are legacy aliases for the complete forms, not redirect links. Version 0.2 changes the 0.1 redirect-oriented React API.

## Session policy

Remembered sessions can last up to three years from creation. Account duration changes require a fresh sign-in (within ten minutes) and cannot exceed that deadline. Choices affect the current session; other sessions retain their own expiry. Browser-session mode has a one-day ceiling. Every backend check contacts King Auth, making revocation effective immediately on the next check. Password reset revokes all sessions; password change revokes other sessions.

Persistent browser cookies are renewed when checked and limited to 400 days per issuance. Browsers can clear them sooner, so three years without visiting is not guaranteed. Shortening duration updates the central session and the website cookie; extending duration requires a fresh session. Keep website backend clocks synchronized.

## Optional OIDC helper

`createKingAuth` from `/server` retains the separate Authorization Code + PKCE redirect integration. It requires registered client credentials and exact redirect URI, stores a short-lived transaction on your backend, and validates the callback before you create your own website session. This is separate from the embedded adapter and its live revocation checks. See its TypeScript declarations for `begin()`/`complete()`. There is no automatic back-channel logout for independently created OIDC website sessions.
