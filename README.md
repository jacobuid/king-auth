# King Auth

Self-hosted shared identity service at `https://kingauth.app`. All registered websites use one user pool and permanent UUIDs. Website authorization and website sessions remain separate from the central account.

The server uses Better Auth and its maintained OAuth provider plugin inside this application, not a hosted authentication service. Production uses MySQL/MariaDB; development and automated tests use Node's SQLite engine.

## Features

- Email/password and username/password login; verified phone/password login once a phone has been linked.
- Email-verification codes, forgot-password and code-based reset, session revocation.
- Account settings: username, password, email (proof of both addresses), and verified phone changes.
- One permanent user ID across all changes and sites.
- OIDC discovery, signed ID tokens, userinfo, Authorization Code + S256 PKCE, exact redirect URI registration, explicit consent.
- Website registration restricted to explicitly configured, email-verified administrators. Dynamic registration is off.
- Database-backed rate limits, secure HttpOnly session cookies in production, origin checks, five-minute codes with attempt limits, and recent-sign-in requirements for identity changes.
- React links/components and an OIDC server helper in `packages/king-auth`.

Account registration and recovery are unavailable until real email delivery is configured. SMS verification is unavailable until a sender is configured. These are explicit configuration gates, not simulated deliveries. Signup requires an email; username-only and phone-only signup are not implemented.

## Local development

Use Node.js 24 or later:

```sh
npm ci
npm run build
npm test
npm start
```

Open `http://localhost:3000`. A local database is created in ignored `.local/`. Environment variables can be loaded with `node --env-file=.env app.js`. Copy `.env.example`, use `NODE_ENV=development` and `AUTH_BASE_URL=http://localhost:3000`, and omit DB_NAME to use SQLite locally. No OTPs or secrets are logged. Tests use an isolated in-memory delivery sink.

## Email and SMS

Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and MAIL_FROM in DirectAdmin. SMTP uses verified TLS (implicit on 465; STARTTLS otherwise). An alternative is SENDMAIL_PATH pointing to a mail executable provided by your host. The host has `/usr/sbin/sendmail`, but it is not automatically enabled: confirm sender/domain deliverability first. Set SPF/DKIM records as your mail provider instructs.

For SMS, configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM. Another provider can be implemented in `server/delivery.mjs`. Real delivery incurs the provider's charges; no messages are sent by tests.

## Administrator setup

Create and verify your account after email is configured. Copy its permanent ID from `/account`. Add that ID to KING_AUTH_ADMIN_IDS in DirectAdmin, save and restart. There is no first-user-becomes-admin behavior and no public bootstrap endpoint. An administrator can register websites at `/developers` and receive client credentials. Keep client secrets on the consuming website's backend. Configure callback URLs exactly; the hosted UI requires HTTPS.

## Integrating websites

See [the package documentation](packages/king-auth/README.md) and [the example backend](examples/website/server.mjs). The package is prepared but has not been published to npm. Package it with `npm pack --workspace @jacobuid/king-auth`, then install the tarball in another project.

The issuer is `https://kingauth.app/api/auth`. Discovery is served both under the issuer and at `/.well-known/openid-configuration`. Register each site's exact callback URL, use PKCE/state/nonce, consume the transaction once, validate tokens on the backend, regenerate the local session, and store the resulting user ID in a secure website session. Never identify users by changeable email or username.

Account-management React components navigate to the central account portal. They do not embed credential forms across origins. This keeps passwords on the identity provider's domain.

Ending or revoking a King Auth session does not automatically clear sessions a website already created. Local website logout and per-site access decisions remain the website's responsibility. Back-channel logout orchestration across consuming apps is not implemented.

## Automatic deployment

Pushes to `main` run `.github/workflows/deploy.yml`: install locked dependencies, check syntax, run security integration tests, build the browser bundle, upload an archive over verified SSH, install runtime dependencies, restart Passenger, and verify `/health` over HTTPS. Hosting environment variables are preserved.

One-time setup:

1. Confirm HostDive permits external SSH and obtain its port.
2. Authorize a dedicated Ed25519 deployment public key in DirectAdmin's SSH Keys manager.
3. Add the matching private key as the repository Actions secret `DEPLOY_SSH_KEY`.
4. Add the server's SSH known-hosts entry as `SSH_KNOWN_HOSTS`, after verifying its fingerprint through the hosting terminal or provider.
5. If necessary, set repository Actions variables `SSH_HOST` and `SSH_PORT`. Defaults are `lv-shared01.dapanel.net` and `53667`.
6. Run the workflow from GitHub Actions or push to `main`.

The server must have Node.js 24 configured with root `king-auth`, startup `app.js`, URL `kingauth.app/`, NODE_ENV=production, AUTH_BASE_URL, DB_HOST, DB_NAME, DB_USER and DB_PASSWORD. Deployment creates a persistent mode-600 `.runtime-secret` if BETTER_AUTH_SECRET is absent. Back this up securely along with the database; changing it invalidates encrypted data/sessions. No credentials are bundled.

The auth engine checks its schema at startup and applies additive migrations, refusing unsafe ones. Back up the database before upgrades. Destructive migrations require a separate reviewed procedure. Deployments currently update files in place; this small shared-host setup does not provide zero-downtime releases or automatic rollback. Revert a code commit to deploy the previous code; do not revert database schemas blindly.

The server overwrites the internal rate-limit IP header from its socket peer address. If the hosting runtime supplies only a loopback address, rate limiting will conservatively share buckets across users; verify the runtime's client-address behavior before scaling. Do not trust browser-supplied forwarding headers.

Keep dependencies updated, configure backups, monitor delivery errors and provision sufficient database/storage capacity before onboarding real users. `/health` means initialization and schema migration succeeded; it is not an email/SMS deliverability check.
