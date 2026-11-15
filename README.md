# King Auth

Self-hosted authentication service and unstyled React library. All consuming websites share one account database at `https://kingauth.app`. Each user has a permanent UUID: store **`user.id`** in your application's data, never their changeable email address.

Signup asks for email and password, followed by an emailed verification code. The account component supports verified email changes, current/new/confirm password, session duration, reviewing sessions, and signing out individual or other sessions. SMS is not configured; phone and username are absent from the default React signup and account components. Existing optional username/phone server APIs remain for compatibility.

New signups require owner approval. Each request emails **jacobuid@gmail.com** with private approve/deny links. Each link opens a confirmation page; merely opening it cannot make a decision. Links expire after seven days and are single-use. A pending or denied account cannot sign in, even with a verified email. Existing accounts are preserved when this policy is introduced. Signup includes a hidden, autofill-disabled honeypot field checked on the server.

After two incorrect passwords, another attempt requires a single-use code sent to that account's email. Codes expire in five minutes, allow three code guesses and have a one-minute resend cooldown. A code is consumed for one password attempt, even when that password is wrong. After five wrong passwords the account is locked, existing sessions are revoked, and the owner receives one notification for that lock event, with confirmation links to unlock, permanently delete, or set a new password. These links also expire after seven days and cannot be used for a different action. Successful sign-in resets the failed-password count. Self-service password reset does not bypass an owner lock.

`kingauth.app/` deliberately returns an empty 404. No public marketing page or implementation guide is hosted there. Required authentication routes remain available; `/developers` is restricted to explicitly configured, verified administrators. Read [the operating handoff](docs/OPERATIONS.md) before changing hosting or credentials.

## How websites integrate

```text
Your website's React components
        | same-origin /auth/api/*
Your website's Node backend adapter
        | HTTPS, server to server
kingauth.app/api/auth -> shared MariaDB user/session database
```

Forms stay inside the consuming website. The backend adapter keeps King Auth credentials in an encrypted, HttpOnly, same-site cookie. Tokens are never returned to React or stored in localStorage. Each website needs a Node backend or compatible Node server routes; a static-only React deployment cannot use this adapter by itself. Websites using embedded forms are trusted with the passwords users submit to them. Only integrate sites you trust; the existing OIDC helper is available separately for sites that should redirect to King Auth instead.

The npm package is prepared as **`@jacobuid/king-auth`**, version 0.2.0, and **has not been published to npm**. Until publication, create and install its tarball:

```sh
npm ci
npm pack --workspace @jacobuid/king-auth
# In your consuming project:
npm install /path/to/jacobuid-king-auth-0.2.0.tgz
```

Consuming backend (Express example):

```js
import express from 'express';
import { createKingAuthServer } from '@jacobuid/king-auth/server';

const app = express();
const auth = createKingAuthServer({
  origin: 'https://your-site.example',
  secret: process.env.SESSION_SECRET, // unique, random, >=32 characters
});
app.use(auth.handler); // mount at root; handles /auth/api/* only

app.get('/api/private', async (req, res, next) => {
  try {
    const session = await auth.getSession(req, res);
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

See [all components and session APIs](packages/king-auth/README.md) and [the runnable example](examples/website). `useAuth()` controls presentation; **protect backend data with `getSession()`**. A frontend check alone is insufficient. Backend checks consult the central session database every time, so revocation takes effect on the next check. An unavailable identity service causes an error; do not treat that as authenticated.

Shared accounts do not mean automatic cross-domain login: each site has its own cookie/session. Logging into a second site uses the same account UUID. That site's memberships and permissions remain its own responsibility.

## Session lifetime

Sign-in offers a remembered session of up to three years. The account component allows browser-session, one day, one week, 30 days, one year, or three years. Changes affect **the current session/device**, require a sign-in within the last ten minutes, and can never extend it beyond three years from its original creation. Signing in again creates a new session.

Server expiry is authoritative and does not slide indefinitely. The backend adapter renews its encrypted browser cookie during session checks, without moving the absolute deadline. Browsers can remove cookies sooner; Chrome limits persistent cookies to [400 days](https://developer.chrome.com/blog/cookie-max-age-expires). Three years of inactivity is therefore not guaranteed. Browser-session mode has a one-day ceiling; browser session restoration may preserve session cookies after a restart.

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

The [example](examples/website/server.mjs) runs a second website on port 4000. In `examples/website`, copy `.env.example` to `.env`, generate a fresh random `SESSION_SECRET`, run `npm install`, `npm run build`, then `npm start`. Set `KING_AUTH_ISSUER=http://localhost:3000/api/auth` for a local auth service. The default uses production King Auth. Local HTTP is explicitly allowed only for loopback development; production requires HTTPS. No OAuth client registration is needed for the embedded adapter.

Tests cover identity changes, code replay, CSRF, session revocation, backend checks, encrypted cookie tampering, duration caps and recent sign-in, OIDC/PKCE, deployment preflight, and a MariaDB adapter test enabled in CI. No production database is used by automated tests.

For the optional real-browser integration test, install Chrome and run `KING_AUTH_BROWSER=1 node --test test/browser.test.mjs` (PowerShell: `$env:KING_AUTH_BROWSER='1'` then the Node command). This exercises the unstyled combined React signup/account/sign-out flow against an isolated test database/message sink.

## Operations

Pushes to `main` deploy through [GitHub Actions](.github/workflows/deploy.yml): locked install, syntax checks, integration tests including ephemeral MariaDB, build, verified SSH upload, database preflight **before** application replacement, install, Passenger restart, HTTPS health check. Releases update files in place; no automatic rollback or zero-downtime guarantee. Startup applies additive migrations and refuses unsafe schema changes. Back up before upgrades.

Production secrets live only on the server: `.env`, `.database-password`, `.smtp-password`, and `.runtime-secret`, all private. Existing process environment wins over `.env`; deployment preserves these files. Never print them, put them into issues, or commit them. Preserve `.runtime-secret` through redeployments and back it up with the database.

HostDive SMTP is configured and authenticated; verification/password flows were tested through its local mailbox. External deliverability still needs SPF/DKIM verification at authoritative Namecheap DNS and an external inbox test. SMS is disabled. Backups and monitoring need an operating policy before real users are onboarded. `/health` verifies initialized service/schema, not email delivery.

The backend uses Better Auth with its maintained OAuth provider plugin, self-hosted in this application. This is not a third-party hosted auth account. Embedded sites forward requests from their own backend, so rate limits currently aggregate users behind each backend IP. See the handoff before scaling or modifying proxy/IP trust.
