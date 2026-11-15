# King Auth operating handoff

This document records the deployed setup and intended architecture as of 2026-11-15. Verify live state before changing it. Never print passwords, private keys, mail codes, cookies, or browser-profile data into terminal logs or AI messages.

## Product decisions

- Shared global user pool, permanent UUID primary key. Emails may change after proving both old/new addresses.
- Primary integration: unstyled React forms inside consuming sites plus a same-origin Node backend adapter. No public marketing page at kingauth.app; root returns an empty 404. Documentation stays in GitHub. Required central auth/consent/account routes remain for compatibility; `/developers` requires a verified administrator.
- Email-only default signup. No SMS provider is configured. Username/phone APIs are optional legacy functionality; do not add them back to default forms without a request.
- Account component: email/password changes, current/new/confirm password, session duration up to three years, session review/revocation, sign-out. Sensitive changes require a recent sign-in. Cookies can disappear before the server deadline.
- Shared accounts do not automatically share cookies or site permissions. Embedded integrations recheck central sessions; standalone OIDC integrations manage their own local sessions and logout.
- The user has authorized implementation and automatic deployment to the existing hosting. Do not repeatedly ask them to reenter already configured database or SMTP passwords. Do not publish npm packages or send support tickets without authorization.

## Source map

| Path | Responsibility |
| --- | --- |
| `app.js` | Passenger-compatible entry and safe startup failure response |
| `server/index.mjs` | Configuration loading, database startup/additive migrations, HTTP routes/headers, blank root |
| `server/auth.mjs` | Better Auth plugins, UUIDs, OTPs, session caps/control endpoints, recent sign-in, OAuth policy |
| `server/config.mjs` | Environment/private-file configuration, production checks |
| `server/delivery.mjs` | Verified-TLS SMTP or explicit sendmail; optional Twilio |
| `client/portal.mjs`, `public/` | Minimal central compatibility UI; built `public/app.js` is ignored |
| `packages/king-auth/forms.mjs` | Unstyled React components and session context |
| `packages/king-auth/proxy.mjs` | Same-origin adapter, encrypted cookie, central verification, CSRF/route/body allowlist |
| `packages/king-auth/server.mjs` | Server exports and optional OIDC helper |
| `examples/website` | Runnable consuming-site React/backend example |
| `test/` | In-memory identity/security/adapter tests and ephemeral CI MariaDB test |
| `.github/workflows/deploy.yml` | Tests/build, SSH deploy with preflight and HTTPS check |

The package is prepared at version 0.2.0 but is not published on npm. Do not claim `npm install @jacobuid/king-auth` works from the registry until publication is confirmed. Use a packed tarball for now. The 0.2 React API replaces 0.1 redirect links with embedded forms. The OIDC helper remains separately available.

## Hosting and SSH

HostDive shared hosting; DirectAdmin/CloudLinux Passenger. Server `lv-shared01.dapanel.net`, IP `162.244.93.2`, SSH port `53667`, user `xdjzyshp`.

Application root: `/home/xdjzyshp/king-auth`; Node 24 virtual environment activation: `/home/xdjzyshp/nodevenv/king-auth/24/bin/activate`. Entry `app.js`, production mode. `node_modules` is a hosting-created symlink into the virtual environment: **preserve it**.

Domain Passenger routing lives in `/home/xdjzyshp/domains/kingauth.app/public_html/.htaccess`. Do not replace it with generic Express/Apache examples. The original default `index.html` was moved to `king-auth/hosting-default.html` so it does not intercept Node responses. Restart by touching `king-auth/tmp/restart.txt` after successful install/config checks.

Dedicated local deployment key and known hosts are in ignored `.deploy/`; GitHub Actions holds `DEPLOY_SSH_KEY` and `SSH_KNOWN_HOSTS`. On Windows use Git's SSH executable if native OpenSSH cannot negotiate this host. Do not disable host-key checking. The SSH fingerprint was checked through an authenticated remote loopback keyscan. Never commit `.deploy/` or its persistent Chrome login profile.

## Database and secrets

MariaDB 10.11.19, database `xdjzyshp_king-autk` (the spelling and hyphen are intentional), host localhost. Dedicated application user **`xdjzyshp_kingapp`**. The original same-named database user is preserved; the application does not require its unknown password.

The dedicated user has local access and the permissions needed for application CRUD/additive migrations. The formerly empty database default was changed to utf8mb4 before initial migration. Initial schema contained 13 tables; repeated migration checks had no pending additions. MariaDB JSON aliases may produce nonfatal longtext type warnings; inspect migration output before acting on these.

Private files under the application root (mode 600):

- `.env`: nonsecret deployment values and optional private overrides. Existing process environment takes precedence.
- `.database-password`: dedicated application DB password; fallback when DB_PASSWORD is absent.
- `.smtp-password`: mailbox password; fallback when SMTP_PASSWORD is absent.
- `.runtime-secret`: persistent central auth/encryption secret; fallback when BETTER_AUTH_SECRET is absent.
- `.env.before-app-user`: historical private backup, if still present.

Do not regenerate `.runtime-secret` on each deployment. Back up secrets securely with the database. Consuming sites use their own separate random SESSION_SECRET, never the central secret. Changing a consuming-site secret invalidates its encrypted cookies.

User originally entered DB values in Node Selector. Later inspection found empty `env_vars`; the cause is unproven. Do not claim the user failed to save or that deployment erased them. The repaired setup uses private server files and has passed authenticated DB/migration checks.

## Known Node Selector problem

DirectAdmin Node Selector previously worked, then reported unavailable. Independent CLI checks reported **CloudLinux license invalid**, with the last successful license check on Nov 11. This is host-owned licensing/integration state. The plugin/selector system directories are root-owned; File Manager cannot repair them.

The running Passenger application, activated Node runtime, SSH, database and SMTP worked independently. Original selector configuration/routing timestamps preceded application deployments. Do not repeatedly modify app files to fix a host license. DirectAdmin ticket `000905108` existed with no host reply during inspection; HostDive billing tickets were empty. Do not assume a DirectAdmin ticket reached billing support, and do not send messages without explicit authorization.

## Email, TLS and DNS

SMTP mailbox `noreply@kingauth.app`, server `lv-shared01.dapanel.net`, port 465, implicit verified TLS, sender `King Auth <noreply@kingauth.app>`. Initial mailbox quota100 MB / sending limit100 per day. SMTP TLS/auth and signup-code verification through the local mailbox were tested. Temporary test users were removed.

External inbox delivery remains unverified. Authoritative DNS is Namecheap (`dns1/2.registrar-servers.com`), not HostDive's DNS zone. SPF was still Namecheap email-forwarding SPF; DKIM was not enabled at last check. Configure sender-authorized SPF/DKIM at the authoritative zone and test Gmail/Outlook before inviting users. Do not claim SMTP authentication proves inbox placement. The host's Maildir can use Zstandard compression; mail test tools must decompress it rather than grep compressed bytes. Never log code contents.

Website A points to162.244.93.2; www CNAME to kingauth.app. Initial wildcard TLS attempts failed because DNS challenges were written to a nonauthoritative HostDive zone. A normal certificate for kingauth.app/www succeeded. Historical error messages are not proof the current certificate is broken. mail/ftp/pop/smtp/webmail DNS names were absent; do not add unrelated names to website issuance. Check the currently served certificate, expiry and renewal status.

## Deployment and recovery

`main` triggers Actions. CI installs locked dependencies on Node24, runs syntax/integration tests with ephemeral MariaDB11, and builds. It uploads the archive via verified SSH. Preflight verifies existing runtime config and DB SELECT1 **before extracting new files**; it is an update guard, not initial provisioning. Runtime dependencies are installed, Passenger restarted, `/health` checked over HTTPS. Existing private files are not packaged/overwritten.

Startup runs additive schema migrations and refuses unsafe ones. Deployments update in place, so they do not provide automatic rollback or zero downtime. To recover a code regression, revert the code commit and deploy; do not blindly roll back database schemas. Take backups before upgrades and preserve the node_modules symlink/Passenger routing.

Useful nonsecret checks: HTTPS `/health` should return ok, `/api/config` should report email enabled/SMS disabled, `/` intentionally returns blank404, anonymous `/developers`404, OIDC discovery at `/.well-known/openid-configuration`. A health response confirms initialization/schema success, not continuous DB availability or mail deliverability.

## Security and remaining work

Central bearer tokens are revocable DB sessions; the adapter encrypts them in HttpOnly cookies and rechecks centrally, rather than trusting a decoded identity snapshot. The encrypted browser envelope is resealed on access, but the underlying central token is not rotated on every check. Session lifetime has a fixed three-year creation ceiling; cookie renewal is not a new login. Browsers cap cookie lifetime and may clear cookies at any time.

The central rate-limit IP header is overwritten from the socket peer. A consuming site's backend aggregates requests under its server IP. Do not trust arbitrary browser X-Forwarded-For to bypass this. A trusted proxy/client-IP policy and capacity/rate-limit plan are needed before onboarding many sites/users.

No owner/admin account is automatically granted privileges. Create/verify an owner, then explicitly configure its UUID in KING_AUTH_ADMIN_IDS if OIDC client registration is needed. Embedded integration does not require OAuth client registration. Websites must implement their own membership/authorization checks using UUIDs.

Remaining operating work: authoritative SPF/DKIM and external delivery checks, restore-tested backups, monitoring/alerts, capacity/rate planning, host-license repair, and npm publication if requested. SMS, account deletion/export, MFA/passkeys, automated back-channel OIDC logout and zero-downtime release infrastructure are not implemented. Do not silently present them as finished features.
