# King Auth operating handoff

This document records the deployed setup and intended architecture as of 2026-11-15. Verify live state before changing it. Never print passwords, private keys, mail codes, cookies, or browser-profile data into terminal logs or AI messages.

## Product decisions

- Shared global user pool, permanent UUID primary key. Emails may change after proving both old/new addresses.
- Primary integration since SDK0.3: unstyled browser-only React forms, direct cookie-free requests to kingauth.app/api/browser, no per-site DNS/registration/adapter. The user explicitly chose browser-stored credentials and no origin allowlist. Any HTTPS website or HTTP loopback development origin can use the public gateway. The optional Node adapter remains via mode="proxy". No public marketing page at kingauth.app; root returns an empty404. Documentation stays in GitHub. Required central auth/consent/account routes remain for compatibility; `/developers` requires a verified administrator.
- Email-only default signup. No SMS provider is configured. Username/phone APIs are optional legacy functionality; do not add them back to default forms without a request.
- New-password policy:8–128 characters with uppercase/lowercase/number/punctuation-or-symbol. Shared implementation is packages/king-auth/password-policy.mjs, used by the server, React forms, central portal and owner recovery forms. Existing login passwords are not revalidated against the new policy.
- Family-only access: all new production users require explicit approval emailed to jacobuid@gmail.com. A hidden signup honeypot is checked centrally. Two incorrect passwords require an emailed verification code before another password attempt; five incorrect passwords lock the account and revoke sessions. The owner gets one alert per lock event with unlock/delete/set-password links. No math challenge is used. Owner links are action-bound, single-use, seven-day bearer secrets with GET previews and explicit POST confirmation.
- Account component: email/password changes, current/new/confirm password, session duration up to three years, session review/revocation, sign-out. Sensitive changes require a recent sign-in. Cookies can disappear before the server deadline.
- Shared accounts do not automatically share cookies or site permissions. Embedded integrations recheck central sessions; standalone OIDC integrations manage their own local sessions and logout.
- The user has authorized implementation and automatic deployment to the existing hosting. Do not repeatedly ask them to reenter already configured database or SMTP passwords. Do not publish npm packages or send support tickets without authorization.

## Source map

| Path | Responsibility |
| --- | --- |
| `app.js` | Passenger-compatible entry and safe startup failure response |
| `server/index.mjs` | Configuration loading, database startup/additive migrations, HTTP routes/headers, blank root |
| `server/auth.mjs` | Better Auth plugins, UUIDs, OTPs, session caps/control endpoints, recent sign-in, OAuth policy |
| `server/browser-api.mjs` | Public cookie-free CORS gateway, route/body allowlist, site-bound session verification |
| `server/config.mjs` | Environment/private-file configuration, production checks |
| `server/delivery.mjs` | Verified-TLS SMTP or explicit sendmail; optional Twilio |
| `server/approval.mjs`, `server/abuse.mjs` | Owner signup approval, per-account failed passwords, email step-up and owner lock recovery |
| `client/portal.mjs`, `public/` | Minimal central compatibility UI; built `public/app.js` is ignored |
| `packages/king-auth/forms.mjs` | Unstyled React components and session context |
| `packages/king-auth/browser.mjs`, `routes.mjs` | Browser bearer transport/storage and shared public-operation definitions |
| `packages/king-auth/proxy.mjs` | Same-origin adapter, encrypted cookie, central verification, CSRF/route/body allowlist |
| `packages/king-auth/server.mjs` | Server exports and optional OIDC helper |
| `examples/website` | Runnable consuming-site React/backend example |
| `test/` | In-memory identity/security/adapter tests and ephemeral CI MariaDB test |
| `.github/workflows/deploy.yml` | Tests/build, SSH deploy with preflight and HTTPS check |

The package is version0.3.1 and installs directly with `npm install github:jacobuid/king-auth#sdk`. It is not published on npm; do not claim registry installation works until publication is confirmed. The `sdk` distribution branch is generated from `packages/king-auth` with `git subtree push` after successful main deployment/tests. Do not edit it manually or merge it into main. The workflow's SDK job uses scoped contents-write permission and full Git history to push a fast-forward split. Main is the server/workspace, not the npm installation target. Consumers should commit their lockfiles; explicit pins must use sdk-branch commit SHAs, not main SHAs. Manual packing remains available for offline use. The0.2 React API replaced0.1 redirect links;0.3 changes AuthProvider's default from proxy to browser. Existing adapter consumers must explicitly set mode="proxy". The OIDC helper remains separately available.

`ProfileMenu` wraps the existing Account UI in a native modal, reached through a profile dropdown with identity and sign-out. It has no bundled CSS/branding. Preserve keyboard navigation, outside dismissal, Escape, native modal focus containment and focus restoration when editing it. The consuming website supplies its avatar and styles, including `::backdrop`; no new server endpoints are needed.

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

Do not regenerate `.runtime-secret` on each deployment. Back up secrets securely with the database. Browser-only consuming sites need no secret. Optional proxy-mode sites use their own separate random SESSION_SECRET, never the central secret. Changing a proxy site's secret invalidates its encrypted cookies.

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

A private SQL dump was created under the server's `.backups/pre-approval-*.sql` before the owner-approval/lockout schema deployment. Files are mode600, directory700; credentials were supplied through a temporary private client config, not command arguments. The temporary config was removed. This one-time snapshot is not a scheduled, restore-tested backup policy.

A second private `.backups/pre-browser-*.sql` snapshot was created before adding session.browserOrigin for browser-only authentication. Preserve these snapshots; neither is included in the deployment archive or repository.

Useful nonsecret checks: HTTPS `/health` should return ok, `/api/config` should report email enabled/SMS disabled, `/` intentionally returns blank404, anonymous `/developers`404, OIDC discovery at `/.well-known/openid-configuration`. A health response confirms initialization/schema success, not continuous DB availability or mail deliverability.

## Security and remaining work

Central bearer credentials are signed opaque, revocable DB sessions, not self-contained JWTs. In browser mode they are intentionally JavaScript-accessible in per-origin sessionStorage or localStorage (remembered). This tradeoff was explicitly selected by the user. Do not imply HttpOnly protection in browser mode. XSS or untrusted scripts on an integrating site can access its credential and submitted passwords. Normal sessions are per site, not SSO. The server stores session.browserOrigin and enforces it in the public gateway and raw get-session hook; raw HTTP strips caller-supplied x-king-auth-browser-origin. The backend verifier uses its configured expected origin and rechecks centrally. Do not trust local decoded state to protect private APIs/files.

The public browser gateway accepts any valid HTTPS Origin or explicit HTTP loopback Origin. It uses Access-Control-Allow-Origin:* without credentials, never forwards browser Cookie/internal headers, and exposes only the allowlisted auth/account routes. It authenticates with signed bearer tokens using Better Auth's requireSignature mode; owner/admin/OAuth routes are excluded. Its Origin rewrite into the internal engine is intentional and occurs only after these cookie-free checks. Keep canonical /api/auth origin protection unchanged. Do not switch to credentialed wildcard CORS or silently reintroduce third-party cookies. Requests without Origin, opaque/null origins and non-loopback HTTP sites are rejected.

The optional proxy adapter still encrypts central credentials in HttpOnly cookies and rechecks them. Its envelope is resealed on access, but underlying bearer tokens are not rotated on every check. Server lifetime has a fixed three-year creation ceiling. Browsers may clear cookies/storage earlier; the400-day cookie cap applies to proxy mode, not browser-mode localStorage. No browser-only UI can protect static assets already downloaded.

The central rate-limit IP header is overwritten from the socket peer. Browser mode reaches King Auth directly; proxy mode aggregates requests under each website's backend IP. The hosting runtime may still supply loopback peers. Do not trust arbitrary browser X-Forwarded-For to bypass this. A trusted proxy/client-IP policy and capacity/rate-limit plan are needed before onboarding many sites/users.

No owner/admin account is automatically granted privileges. Create/verify an owner, then explicitly configure its UUID in KING_AUTH_ADMIN_IDS if OIDC client registration is needed. Embedded integration does not require OAuth client registration. Websites must implement their own membership/authorization checks using UUIDs.

Approval is enabled by default and forced on in production. Tests disable it only in isolated fixtures that test unrelated features. New accounts are pending; existing accounts default approved during the additive migration. Denied accounts remain stored and blocked. Owner deletion permanently deletes the central user, credential accounts and sessions; consuming-site data keyed by UUID is not deleted automatically. Protect owner email links and prevent proxy/access logs from retaining query tokens. They grant the stated action to whoever possesses them and do not require a separate owner login. Password-action links require matching new passwords and revoke sessions. If an owner action fails after its atomic claim, the account remains locked and requires operator recovery; do not unlock on partial failure.

Sign-in-code records use keyed hashes, five-minute expiry, atomic single-use consumption, three guesses and a one-minute per-account resend cooldown. A correct code is consumed even if the accompanying password is wrong. Five wrong passwords across IPs produce one atomic lock event/notification; successful login resets the count. Invalid/missing codes do not increment the wrong-password counter. Self-service password reset does not unlock an owner-locked account. SMTP failures must never auto-approve or auto-unlock users. Notification delivery/retry monitoring is still an operating requirement; a database lock is authoritative even if mail delivery fails.

Remaining operating work: authoritative SPF/DKIM and external delivery checks, restore-tested backups, monitoring/alerts, capacity/rate planning, host-license repair, and npm publication if requested. SMS, account deletion/export, MFA/passkeys, automated back-channel OIDC logout and zero-downtime release infrastructure are not implemented. Do not silently present them as finished features.
