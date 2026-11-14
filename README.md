# King Auth

Minimal Node.js Hello World for testing HostDive deployment. No database or authentication is implemented yet.

Run locally with `npm start`. `/` returns `Hello World! King Auth is running.` and `/health` returns JSON.

## Automatic deployment

Pushes to `main` run `.github/workflows/deploy.yml`. The workflow checks JavaScript syntax, uploads only `app.js` and `package.json` over SSH, triggers a Passenger restart, and verifies the public response. Hosting environment variables are preserved. This example has no dependencies or build step.

One-time setup:

1. Confirm HostDive permits external SSH and obtain its port.
2. Authorize a dedicated Ed25519 deployment public key in DirectAdmin's SSH Keys manager.
3. Add the matching private key as the repository Actions secret `DEPLOY_SSH_KEY`.
4. Add the server's SSH known-hosts entry as `SSH_KNOWN_HOSTS`, after verifying its fingerprint through the hosting terminal or provider.
5. If necessary, set repository Actions variables `SSH_HOST` and `SSH_PORT`. Defaults are `lv-shared01.dapanel.net` and `53667`.
6. Run the workflow from GitHub Actions or push to `main`.

The server must already have the Node.js 24 application configured with root `king-auth`, startup file `app.js`, and URL `kingauth.app/`.

Never commit private keys or database credentials. Database configuration is not needed by this Hello World example.
