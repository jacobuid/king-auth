import http from 'node:http';
import {Readable} from 'node:stream';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createPool } from 'mysql2/promise';
import { DatabaseSync } from 'node:sqlite';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { getMigrations } from 'better-auth/db/migration';
import { oauthProviderOpenIdConfigMetadata, oauthProviderAuthServerMetadata, verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import { loadConfig } from './config.mjs';
import { delivery } from './delivery.mjs';
import { createAuth } from './auth.mjs';
import {createBrowserAPI} from './browser-api.mjs';

// File-based settings are useful on shared hosts; panel variables take precedence.
const inheritedEnvironment = { ...process.env };
if (existsSync('.env')) loadEnvFile('.env');
Object.assign(process.env, inheritedEnvironment);
const config = loadConfig();
if (config.production && !config.database) throw new Error('Production requires a configured MySQL database');
if (!config.database) await mkdir(dirname(resolve(config.sqlitePath)), { recursive: true });
const database = config.database ? createPool(config.database) : new DatabaseSync(config.sqlitePath);
const sender = delivery(config);
export const auth = createAuth({ config, database, sender });
const migrations = await getMigrations(auth.options);
await migrations.runMigrations();
const handler = toNodeHandler(auth);
const browserAPI=createBrowserAPI({auth,config});
const shell = await readFile(new URL('../public/index.html', import.meta.url));
const assets = new Map(await Promise.all(['app.css', 'app.js','password-toggle.js'].map(async name => [name, await readFile(new URL(`../public/${name}`, import.meta.url))])));
function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }

http.createServer(async (req, res) => {
  // Never trust an IP header supplied by a browser. Passenger supplies the peer address.
  req.headers['x-king-auth-client-ip'] = req.socket.remoteAddress || '127.0.0.1';
  delete req.headers['x-king-auth-browser-origin'];
  delete req.headers['x-king-auth-app'];
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (config.production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  try {
    const url = new URL(req.url, config.baseURL);
    if(url.pathname.startsWith('/api/browser/')){
      const response=await browserAPI(new Request(url,{method:req.method,headers:fromNodeHeaders(req.headers),...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'})}));
      res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(await response.text());
    }
    // This domain is an identity service, not a public website or documentation site.
    if (url.pathname === '/') { res.writeHead(404); return res.end(); }
    if (url.pathname === '/health') return json(res, 200, { status: 'ok', app: 'king-auth' });
    if (url.pathname === '/api/config') return json(res, 200, { emailEnabled: sender.emailEnabled, smsEnabled: sender.smsEnabled });
    if (url.pathname === '/.well-known/openid-configuration' || url.pathname === '/.well-known/oauth-authorization-server/api/auth') {
      const helper = url.pathname.includes('openid') ? oauthProviderOpenIdConfigMetadata : oauthProviderAuthServerMetadata;
      const response = await helper(auth)(new Request(url));
      res.writeHead(response.status, Object.fromEntries(response.headers)); return res.end(await response.text());
    }
    if (url.pathname === '/api/consent-details') {
      const signed = new Set(['sig', 'ba_param', ...url.searchParams.getAll('ba_param')]);
      const query = new URLSearchParams([...url.searchParams].filter(([key]) => signed.has(key))).toString();
      const { secret } = await auth.$context;
      if (!await verifyOAuthQueryParams(query, secret)) return json(res, 400, { message: 'This sign-in request is invalid or expired. Start again from your website.' });
      const client = await auth.api.getOAuthClientPublic({ headers: fromNodeHeaders(req.headers), query: { client_id: url.searchParams.get('client_id') } });
      return json(res, 200, { name: client.client_name, host: new URL(url.searchParams.get('redirect_uri')).host, scopes: url.searchParams.get('scope') });
    }
    if (url.pathname === '/api/admin/status') {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      return json(res, 200, { admin: Boolean(session?.user.emailVerified && config.adminIds.includes(session.user.id)) });
    }
    if (url.pathname.startsWith('/api/auth/')) return await handler(req, res);
    if (url.pathname.startsWith('/assets/')) {
      const name = url.pathname.slice(8);
      if (!assets.has(name)) return json(res, 404, { message: 'Not found' });
      res.writeHead(200, { 'Content-Type': name.endsWith('.css') ? 'text/css' : 'text/javascript' }); return res.end(assets.get(name));
    }
    if (url.pathname === '/developers') {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (!session?.user.emailVerified || !config.adminIds.includes(session.user.id)) return json(res, 404, { message: 'Not found' });
    }
    if (req.method === 'GET' && ['/sign-in', '/sign-up', '/verify-email', '/forgot-password', '/reset-password', '/account', '/consent', '/developers'].includes(url.pathname)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(shell);
    }
    json(res, 404, { message: 'Not found' });
  } catch (error) {
    console.error('Request failed:', error.code || error.name);
    if (!res.headersSent) json(res, 500, { message: 'The request could not be completed. Please try again.' });
    else res.end();
  }
}).listen(process.env.PORT || 3000);
