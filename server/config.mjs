import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const url = new URL(env.AUTH_BASE_URL || (production ? 'https://kingauth.app' : 'http://localhost:3000'));
  if (production && url.protocol !== 'https:') throw new Error('Production requires HTTPS');
  const secretFile = resolve('.runtime-secret');
  const secret = env.BETTER_AUTH_SECRET || (existsSync(secretFile) ? readFileSync(secretFile, 'utf8').trim() : 'development-only-secret-change-before-production-1234');
  const passwordFile = resolve('.database-password');
  const databasePassword = env.DB_PASSWORD || (existsSync(passwordFile) ? readFileSync(passwordFile, 'utf8') : undefined);
  const smtpPasswordFile = resolve('.smtp-password');
  const smtpPassword = env.SMTP_PASSWORD || (existsSync(smtpPasswordFile) ? readFileSync(smtpPasswordFile, 'utf8') : undefined);
  if (production && (secret.startsWith('development-') || secret.length < 32)) throw new Error('Set a strong BETTER_AUTH_SECRET');
  return {
    production, baseURL: url.origin, secret,
    database: env.DB_NAME ? { host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 3306), database: env.DB_NAME, user: env.DB_USER, password: databasePassword, connectionLimit: 3, timezone: 'Z' } : null,
    sqlitePath: env.SQLITE_PATH || '.local/king-auth.sqlite',
    adminIds: (env.KING_AUTH_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
    approval: {required:production || env.SIGNUP_APPROVAL_REQUIRED!=='false',ownerEmail:'jacobuid@gmail.com'},
    mail: { host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), user: env.SMTP_USER, pass: smtpPassword, from: env.MAIL_FROM || 'King Auth <noreply@kingauth.app>', sendmail: env.SENDMAIL_PATH },
    sms: { sid: env.TWILIO_ACCOUNT_SID, token: env.TWILIO_AUTH_TOKEN, from: env.TWILIO_FROM },
  };
}
