# King Auth

Self-hosted authentication service and unstyled React library. All consuming websites share one account database at `https://kingauth.app`. Each user has a permanent UUID: store **`user.id`** in your application's data, never their changeable email address.

Signup asks for email and password, followed by an emailed verification code. The account component supports verified email changes, current/new/confirm password, session duration, reviewing sessions, and signing out individual or other sessions. SMS is not configured; phone and username are absent from the default React signup and account components. Existing optional username/phone server APIs remain for compatibility.

New signups require owner approval. Each request emails **jacobuid@gmail.com** with private approve/deny links. Each link opens a confirmation page; merely opening it cannot make a decision. Links expire after seven days and are single-use. A pending or denied account cannot sign in, even with a verified email. Existing accounts are preserved when this policy is introduced. Signup includes a hidden, autofill-disabled honeypot field checked on the server.

After two incorrect passwords, another attempt requires a single-use code sent to that account's email. Codes expire in five minutes, allow three code guesses and have a one-minute resend cooldown. A code is consumed for one password attempt, even when that password is wrong. After five wrong passwords the account is locked, existing sessions are revoked, and the owner receives one notification for that lock event, with confirmation links to unlock, permanently delete, or set a new password. These links also expire after seven days and cannot be used for a different action. Successful sign-in resets the failed-password count. Self-service password reset does not bypass an owner lock.

`kingauth.app/` deliberately returns an empty 404. No public marketing page or implementation guide is hosted there. Required authentication routes remain available; `/developers` is restricted to explicitly configured, verified administrators. Read [the operating handoff](docs/OPERATIONS.md) before changing hosting or credentials.

## How websites integrate

```text
Your website's React components (static hosting is supported)
        | HTTPS + site-bound bearer credential; cookies omitted
kingauth.app/api/browser -> shared MariaDB user/session database
```

Forms stay inside the consuming website and call King Auth directly. No consuming-site Node adapter, client secret, DNS record, or site registration is required. Any HTTPS website can use the browser API; explicit HTTP loopback origins are supported for local development. The API uses noncredentialed CORS (`Access-Control-Allow-Origin: *`), ignores cookies, and accepts only a narrow set of authentication/account operations. Owner/admin/OAuth endpoints are excluded.

Each site stores its own signed opaque bearer credential in sessionStorage, or localStorage when the user chooses to stay signed in. Sessions are bound to that site's origin. **These credentials are accessible to JavaScript on the consuming site.** This browser-storage tradeoff is intentional; use trusted scripts and protect the site against XSS. Do not log tokens or put them into URLs. The optional backend adapter remains available for sites that prefer encrypted HttpOnly cookies instead. Embedded sites are also trusted with submitted passwords.

Install the library directly from GitHub; no npm publication or manual tarball is needed:

```sh
npm install github:jacobuid/king-auth#sdk
```

Imports use **`@jacobuid/king-auth`** as shown below. The automatically maintained `sdk` branch contains only the library, version 0.3.0; `main` contains the service and workspace, so use `#sdk` when installing. Commit your consuming project's `package-lock.json` to pin the exact Git commit. To update later, run the same install command again and commit the updated lockfile. For an explicitly fixed release, replace `sdk` with a full commit SHA from the **sdk branch**. Git must be available on the installing machine. The package is not published to the npm registry.

If your site has private API data, verify its bearer credential on that API's backend (Express example). This verifier does not install an auth adapter or handle signup/login:

```js
import express from 'express';
import { createKingAuthVerifier } from '@jacobuid/king-auth/server';

const app = express();
const auth = createKingAuthVerifier({
  origin: 'https://your-site.example',
});

app.get('/api/private', async (req, res, next) => {
  try {
    const session = await auth.getSession(req);
    res.set('Cache-Control', 'no-store');
    if (!session) return res.status(401).json({ message: 'Sign in first' });
    // Check this site's permissions using session.user.id.
    res.json({ userId: session.user.id });
  } catch (error) { next(error); } // service failures must deny access
});
```

React:

```jsx
import {
  AuthProvider, SignIn, SignUp, ForgotPassword, Account,
  SignOut, ProfileMenu, useAuth,
} from '@jacobuid/king-auth';

function Status() {
  const { user, isSignedIn, isLoading } = useAuth();
  if (isLoading) return null;
  return isSignedIn ? <p>Signed in as {user.email}</p> : <SignIn />;
}

function App() {
  return <AuthProvider>
    <ProfileMenu />
    <Status />
    {/* Render these wherever your site's navigation calls for them. */}
    <SignUp />
    <ForgotPassword />
    <Account className="my-account" />
    <SignOut className="my-button">Sign out</SignOut>
  </AuthProvider>;
}
```

Every component is unstyled: semantic HTML, accessible labels/status messages, and class names; no CSS import, inline theme, or design dependency. Pass `className`/`style` or target `.king-auth-form`, `.king-auth-fields`, `.king-auth-field`, `.king-auth-error`, and `.king-auth-status`. `style` is applied only when you supply it.

`ProfileMenu` provides a profile/initials button that opens a dropdown showing the user's name/email, **Manage account**, and **Sign out**. Manage account opens the existing `Account` component in a native modal dialog, including email/password changes and session controls. It supports keyboard menu navigation, outside-click dismissal, Escape, modal focus containment, and focus restoration. It renders nothing while signed out. Supply an `avatar` React node for your own icon/photo and use `triggerClassName`, `menuClassName`, `dialogClassName`, and `accountClassName` to style the parts. Style `.king-auth-account-dialog::backdrop` for your site's modal overlay. No branding, footer, or theme is added.

See [all components and session APIs](packages/king-auth/README.md) and [the browser-only example](examples/browser-only). `useAuth()` controls presentation; **protect backend data with the verifier's `getSession()`**. A frontend check alone is insufficient. Backend checks consult the central session database every time, so revocation takes effect on the next check. An unavailable identity service causes an error; do not treat that as authenticated.

In browser mode, `useAuth().getToken()` supplies the bearer credential for calls to your own trusted API: `fetch('/api/private', {headers: {Authorization: 'Bearer ' + getToken()}})`. A static-only site can use all auth/account components without a backend, but frontend visibility checks cannot protect HTML, JavaScript or files already shipped to the browser. Use server-side permissions or access rules for private resources.

Shared accounts do not mean automatic cross-domain login: each site has its own credential/session. Logging into a second site uses the same account UUID. That site's memberships and permissions remain its own responsibility. Normal sign-out affects that session; account session controls can deliberately end sessions on other sites.

## Session lifetime

Sign-in offers a remembered session of up to three years. The account component allows browser-session, one day, one week, 30 days, one year, or three years. Changes affect **the current session/device**, require a sign-in within the last ten minutes, and can never extend it beyond three years from its original creation. Signing in again creates a new session.

Server expiry is authoritative and does not slide indefinitely. Browser mode uses sessionStorage for unremembered sessions (one-day maximum) and localStorage for remembered sessions; account duration choices update central expiry and storage selection. Clearing site data or browser storage eviction can end persistence sooner. Three years of inactivity is not guaranteed. Optional `mode="proxy"` uses the older encrypted HttpOnly-cookie adapter instead; those cookies have a 400-day per-issuance cap and are renewed during use without moving the absolute session deadline.

Password resets revoke existing sessions. Password changes sign out other sessions; account controls can end individual sessions or all other sessions across embedded integrations. User-interface state refreshes on focus or `refresh()`; protected backend requests always recheck. Existing standalone OIDC website sessions are separate and need their own logout policy.

## Develop and verify

Use Node.js 24+:

```sh
npm ci
npm run check
npm test
npm run build
```

For local service development, copy `.env.example` to ignored `.env`, set `NODE_ENV=development`, `AUTH_BASE_URL=http://localhost:3000`, and omit `DB_NAME` to use SQLite under ignored `.local/`. Run `npm start`; navigate to `/sign-in`, not the intentionally blank root. Configure real SMTP to try registration manually; tests use an isolated message sink and send no real emails or texts.

Approval defaults on. Isolated development/test environments may set `SIGNUP_APPROVAL_REQUIRED=false`; production always requires owner approval. Owner links contain bearer secrets: do not forward them or log their query strings, and protect the owner's mailbox with MFA. The honeypot is a basic bot filter; edge DDoS protection and monitoring remain separate operating tasks.

The [browser-only example](examples/browser-only) builds a static website: run `npm install` and `npm run build` there, then serve `dist` on HTTPS hosting or a loopback development server. It has no application backend or environment secret. `<AuthProvider>` defaults to browser mode and the production API. Set `apiUrl="http://localhost:3000/api/browser"` only when testing against a local auth service.

The older [backend-adapter example](examples/website/server.mjs) remains available on port 4000. Its client explicitly uses `<AuthProvider mode="proxy">`. Copy its `.env.example`, generate a fresh random SESSION_SECRET, install/build/start. Keep this mode if you prefer server-managed HttpOnly cookies. Version 0.3 changes AuthProvider's default from proxy to browser, so existing adapter consumers must specify `mode="proxy"` when upgrading.

Tests cover identity changes, code replay, CSRF, session revocation, backend checks, encrypted cookie tampering, duration caps and recent sign-in, OIDC/PKCE, deployment preflight, and a MariaDB adapter test enabled in CI. No production database is used by automated tests.

For optional real-browser tests, install Chrome and run `KING_AUTH_BROWSER=1 node --test test/browser.test.mjs test/browser-only.test.mjs` (PowerShell: `$env:KING_AUTH_BROWSER='1'` then the Node command). These exercise the proxy flow and browser-only flow across real origins, with cookie omission, persistence and separate-site sessions, against isolated databases/message sinks.

## Operations

Pushes to `main` deploy through [GitHub Actions](.github/workflows/deploy.yml): locked install, syntax checks, integration tests including ephemeral MariaDB, build, verified SSH upload, database preflight **before** application replacement, install, Passenger restart, HTTPS health check. Releases update files in place; no automatic rollback or zero-downtime guarantee. Startup applies additive migrations and refuses unsafe schema changes. Back up before upgrades.

Production secrets live only on the server: `.env`, `.database-password`, `.smtp-password`, and `.runtime-secret`, all private. Existing process environment wins over `.env`; deployment preserves these files. Never print them, put them into issues, or commit them. Preserve `.runtime-secret` through redeployments and back it up with the database.

HostDive SMTP is configured and authenticated; verification/password flows were tested through its local mailbox. External deliverability still needs SPF/DKIM verification at authoritative Namecheap DNS and an external inbox test. SMS is disabled. Backups and monitoring need an operating policy before real users are onboarded. `/health` verifies initialized service/schema, not email delivery.

The backend uses Better Auth with its maintained OAuth provider and signed bearer plugins, self-hosted in this application. Browser mode contacts King Auth directly; proxy mode aggregates users behind each backend IP. The hosting runtime's socket-peer behavior still needs verification before scaling or modifying proxy/IP trust.
