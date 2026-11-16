# @jacobuid/king-auth

Unstyled React authentication forms backed by the shared King Auth user pool. Install directly from GitHub:

Password policy: 8–128 characters with uppercase, lowercase, a number, and a special character (punctuation/symbol). Server and new-password forms enforce the same rule; current-password/sign-in fields continue accepting existing passwords.

```sh
npm install github:jacobuid/king-auth#sdk
```

Use `@jacobuid/king-auth` in imports. The automatically maintained `sdk` branch contains just this package (version 0.4.0); `main` is the server/workspace and should not be used as the npm install target. Git must be installed. Commit your app's `package-lock.json` to pin the resolved Git commit. Rerun the install command to update, or replace `sdk` with a full commit SHA from that branch to pin explicitly. No npm registry publication or manual packing is required.

## Optional backend adapter

Browser mode is the default and needs no adapter, DNS setup, client secret or registered URL. The following adapter is optional: use `<AuthProvider mode="proxy">` with it if you prefer HttpOnly cookies and keep credentials out of page JavaScript.

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

The optional handler exposes an allowlist of `/auth/api/*` routes used by the forms, checks exact Origin and JSON for mutations, and uses an authenticated encrypted HttpOnly SameSite=Lax cookie (Secure and __Host-prefixed over HTTPS). Never log request bodies or cookie headers. This mode requires your backend; default browser mode supports static hosting.

## React

```jsx
import {AuthProvider,SignIn,SignUp,Account,ProfileMenu,SignOut,useAuth} from '@jacobuid/king-auth';
function MyApp(){return <AuthProvider><MyRoutes /></AuthProvider>;}
function MyRoutes(){
  const {user,isSignedIn,isLoading,error,refresh}=useAuth();
  if(isLoading)return null;
  return isSignedIn ? <><ProfileMenu /><p>{user.email}</p></> : <SignIn />;
}
```

`AuthProvider` defaults to `mode="browser"`, calling `https://kingauth.app/api/browser` directly. Override `apiUrl` for a local auth service. Any HTTPS origin or explicit HTTP loopback development origin is accepted, without per-site registration. Requests omit cookies and use signed bearer credentials, so third-party-cookie support is unnecessary. The public gateway excludes owner/admin/OAuth operations and binds sessions to the originating site. One shared account UUID, independent sign-in on each site, no automatic SSO.

`useAuth()` (alias `useSession()`) exposes `user`, `session`, `isSignedIn`, `isLoading`/`loading`, `error`, `refresh()`, `signOut()`, and `getToken()`. It checks on mount, focus and browser storage changes. `call(route, body?)` is available for custom UI; omitting body makes a GET. `RequireAuth` accepts `children` and `fallback` for display only. In proxy mode, `basePath` matches your adapter and `getToken()` returns null.

Browser credentials live in sessionStorage by default or localStorage when remembered; **page JavaScript can access them**. Only enter credentials on trusted sites, protect against XSS, and never put bearer tokens into URLs/logs. Clearing/evicting storage can end persistence sooner. Credentials are opaque, not client-decodable JWT identity claims. Use `getSession()`/`isSignedIn()` to check centrally; decoding stored state alone is not authentication.

Without React, `createBrowserClient()` exposes `request(route,body?)`, `getSession()`, `isSignedIn()`, `signOut()` and `getToken()` with the same storage/transport. It accepts optional `apiUrl` and injectable `fetch`.

For private API data, send `Authorization: Bearer ${getToken()}` from your UI to your own trusted API. That API can use `createKingAuthVerifier({origin:'https://your-site.example'})` from `/server`, then `await verifier.getSession(req)` or `await verifier.isSignedIn(req)`. No adapter or secret is needed, but each backend request must verify authentication and apply its own permissions. Verification consults King Auth, returns null for invalid/revoked/wrong-origin sessions, and throws on service errors; deny access on errors. Browser-only login does not protect static files already delivered to users.

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
| `ProfileMenu` | Profile button, identity dropdown, Manage account modal, and sign-out |
| `Avatar` | Gravatar image with a local generic silhouette fallback |
| `Reauthenticate` | Confirm current password for one protected action without renewing or ending the login session |

Forms accept `className`, `style`, `submitLabel`, `onSuccess(data)`, and `onError(error)`. Account/Sessions accept `className`/`style`. SignOut accepts `onSuccess()`/`onError(error)`. Components use semantic HTML and accessible labels/announcements, no CSS or inline theme; style `.king-auth-form`, `.king-auth-fields`, `.king-auth-field`, `.king-auth-error`, `.king-auth-status` in your app. Inputs/buttons inherit your site's CSS. Caller-provided `style` is optional.

All password inputs have an unstyled eye toggle, independently showing/hiding the corresponding value. Show/Hide buttons have accessible labels, pressed state and input associations, work with keyboard controls, and do not submit forms. Successful submissions clear and hide password values. Style `.king-auth-password` (wrapper), `.king-auth-password-toggle` (button), and `.king-auth-password-icon` (SVG using currentColor).

## Profile dropdown and account popup

```jsx
<AuthProvider>
  <ProfileMenu
    className="profile"
    triggerClassName="avatar-button"
    menuClassName="profile-dropdown"
    dialogClassName="account-modal"
    accountClassName="account-content"
    avatar={<MyAvatar />}
  />
</AuthProvider>
```

The default trigger shows the user's Gravatar, with a local generic gray silhouette if no Gravatar exists or loading fails. Clicking it opens name/email plus **Manage account** and **Sign out**. Manage account opens the existing `Account` component inside a native `<dialog>` modal. It includes verified email changes, password changes, session duration and session revocation. The dropdown closes on outside click or Escape; arrow keys/Home/End navigate its actions. The modal contains keyboard focus and returns focus to the profile button when closed. It closes with Escape or **Close**. The component renders nothing for anonymous/loading sessions.

All appearance belongs to the importing site. In addition to the class props above, hooks are `.king-auth-profile`, `.king-auth-profile-trigger`, `.king-auth-profile-dropdown`, `.king-auth-profile-identity`, `.king-auth-account-dialog`, and `.king-auth-account-close`. Style `.king-auth-account-dialog::backdrop` for the overlay. Native browser defaults apply until your CSS overrides them. There is no bundled styling, branding, or development footer. `triggerLabel` customizes the accessible button name (default **Open profile menu**); `avatar` accepts any React node. Popup contents are the same `Account` component you can also render directly.

## Avatar overrides and styling

Avatar precedence is **custom `avatar` → Gravatar → generic local silhouette**. The default avatar is shown in the profile button, dropdown and account popup. The fallback is a built-in SVG shaped like a generic profile photo; it needs no external image request. Gravatar uses SHA-256 of the trimmed/lowercase email, G-rated images, and `d=404` so missing images select our local fallback. It updates when the email changes. See [Gravatar's image documentation](https://docs.gravatar.com/sdk/images/).

```jsx
import {ProfileMenu, Account, Avatar} from '@jacobuid/king-auth';

// Automatic Gravatar with generic fallback:
<ProfileMenu />

// Override with your own photo or component. No Gravatar requests are made.
<ProfileMenu avatar={<img src="/images/profile.jpg" alt="" className="my-avatar" />} />
<ProfileMenu avatar={<MyCustomAvatar />} />

// Disable Gravatar entirely and use the generic silhouette:
<ProfileMenu gravatar={false} avatarSize={48} avatarClassName="my-avatar" />

// Standalone account UI accepts the same avatar overrides:
<Account avatar={<MyCustomAvatar />} />
<Account gravatar={false} avatarSize={64} avatarClassName="my-avatar" />

// Or use the avatar by itself:
<Avatar email="person@example.com" size={64} alt="Profile photo" className="my-avatar" />
```

Put appearance rules in your own site's CSS, for example:

```css
.my-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}
```

The default image/SVG has `.king-auth-avatar`; fallback SVGs also have `data-avatar-fallback`. `avatarSize` defaults to40 pixels (16–2048 supported) and supplies intrinsic image/SVG dimensions; your CSS may override them. `avatarClassName` styles the default Gravatar/fallback, while custom `avatar` content supplies its own classes and error handling. Set `avatar={false}` to hide the avatar entirely. Explicitly supplied `style` is optional; no theme/CSS is injected by the library.

Gravatar requests disclose an email hash and the browser's network address to Gravatar, with referrer transmission disabled. Set `gravatar={false}` or supply a custom avatar to avoid those requests. If your site uses CSP, allow `https://www.gravatar.com` in `img-src` to load Gravatars. A blocked/failed image still falls back to the local silhouette. No API key or additional backend configuration is needed.

Production signup requires approval by the owner, notified at jacobuid@gmail.com. Verification displays a pending-approval message; approval does not replace email verification. Signup includes a hidden honeypot field. SignIn automatically asks for an emailed code after two wrong passwords. The code expires after five minutes, has three guesses, and is consumed for one password attempt; resends have a one-minute cooldown. Five wrong passwords lock the account and notify the owner once, with confirmation links to unlock, delete or set a password. Missing/invalid codes do not count as password attempts. These policies are enforced by the central server across websites/IP addresses.

`ChangePhone` and `ChangeUsername` remain optional exports for compatibility; absent from default account UI. SMS is currently unavailable. `SignInButton` and `SignUpButton` are legacy aliases for the complete forms, not redirect links. Version 0.2 changes the 0.1 redirect-oriented React API.

## Session policy

Remembered sessions can last up to three years from creation. Account duration changes require a fresh sign-in (within ten minutes) and cannot exceed that deadline. Choices affect the current session; other sessions retain their own expiry. Browser-session mode has a one-day ceiling. Every backend check contacts King Auth, making revocation effective immediately on the next check. Password reset revokes all sessions; password change revokes other sessions.

Browser mode persists opaque credentials in localStorage when remembered, with an authoritative server deadline capped at three years. The SDK checks server validity on refresh; the deadline does not slide. Unremembered sessions use sessionStorage with a one-day maximum. Shortening/changing duration updates central expiry and storage selection. Optional proxy-mode cookies are renewed when checked and limited to 400 days per issuance. Browsers may clear storage/cookies sooner, so three years of inactivity is not guaranteed.

Version 0.3 changes AuthProvider's default to browser mode. Existing 0.2 backend-adapter consumers should add `mode="proxy"`; direct browser consumers can use `<AuthProvider>` without props.

## Confirm a password without signing out

Render the unstyled `Reauthenticate` form inline or in your own popup when a signed-in user attempts a sensitive operation. `action` is an application-defined identifier, for example `settings:change`, `billing:edit`, or `document:123:delete`. It accepts the usual form styling/labels/error callback and `onSuccess({proof,action,expiresAt})`. The password field includes its show/hide toggle. Existing passwords are accepted; this is not a new-password form.

```jsx
import {Reauthenticate,useAuth} from '@jacobuid/king-auth';

function ConfirmSettingChange() {
  const {getToken}=useAuth();
  return <Reauthenticate
    action="settings:change"
    onError={error => console.log(error.code)}
    onSuccess={async ({proof}) => {
      const response=await fetch('/api/settings', {
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},
        body:JSON.stringify({proof,setting:'your-new-value'}),
      });
      // Handle denial locally; do not call signOut() for a failed confirmation.
      if (!response.ok) return;
      // Show your site's successful-setting-change state here.
    }}
  />;
}
```

For custom UI, `await useAuth().reauthenticate(action,password)` returns the same proof. Browser clients can also call `client.request('reauthenticate',{action,password})`. Keep the proof transient; do not put it in URLs or persist it as a reusable authorization flag.

On your backend, use the same verifier used for normal sessions:

```js
import express from 'express';
import {createKingAuthVerifier} from '@jacobuid/king-auth/server';
const app=express();
const auth=createKingAuthVerifier({origin:'https://your-site.example'});
app.post('/api/settings',express.json(),async(req,res,next)=>{
  try {
    const session=await auth.getSession(req);
    if(!session)return res.status(401).json({allowed:false,message:'Sign in first.'});
    // Check this user's application permissions before consuming the proof.
    const allowed=await auth.verifyReauthentication(req,{
      proof:req.body.proof,
      action:'settings:change', // derive this on the server; never trust a client-supplied action
    });
    if(!allowed)return res.status(403).json({allowed:false,message:'Sorry, you cannot access this page or perform this action.'});
    // Validate and save req.body.setting here, using session.user.id.
    res.json({allowed:true});
  }catch(error){next(error);} // deny on service errors; do not log out the user
});
```

The optional backend adapter (`createKingAuthServer`, proxy mode) exposes the same `verifyReauthentication(req,{proof,action})` method; call its `getSession(req)` for normal authorization. Proofs are scoped to current session, user, site and action, expire after five minutes or session expiry (whichever is sooner), and are atomically consumed once. For record/transaction-specific operations, include that trusted identifier in the action string. A browser-side success flag alone must never authorize a backend operation. Consuming a proof does not renew the session or satisfy King Auth's separate recent-sign-in rules for its own identity changes.

Wrong passwords return HTTP 403 JSON with `allowed:false`, `code:'REAUTHENTICATION_FAILED'`, and a denial message. Throttling returns 429 without locking the account; there are five attempts per minute per session plus IP throttling. Successful and failed confirmations do not revoke/rotate/renew the login session, change its expiry, or increment the normal sign-in failure counter. The SDK preserves browser credentials and signed-in UI state for confirmation errors, including 401 and service failures. Independently expired/revoked sessions remain invalid and may be cleared by a later normal session refresh; confirmation cannot restore or extend them.

## Optional OIDC helper

`createKingAuth` from `/server` retains the separate Authorization Code + PKCE redirect integration. It requires registered client credentials and exact redirect URI, stores a short-lived transaction on your backend, and validates the callback before you create your own website session. This is separate from the embedded adapter and its live revocation checks. See its TypeScript declarations for `begin()`/`complete()`. There is no automatic back-channel logout for independently created OIDC website sessions.
