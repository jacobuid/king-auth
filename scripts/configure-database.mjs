import { readFileSync, existsSync, writeFileSync, renameSync, unlinkSync, mkdirSync, closeSync, openSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { randomBytes } from 'node:crypto';
import { createPool } from 'mysql2/promise';
import { getMigrations } from 'better-auth/db/migration';
import { loadConfig } from '../server/config.mjs';
import { createAuth } from '../server/auth.mjs';
import { delivery } from '../server/delivery.mjs';

const inherited = { ...process.env };
if (existsSync('.env')) loadEnvFile('.env');
Object.assign(process.env, inherited);
const password = readFileSync(0, 'utf8');
if (!password) throw new Error('No password provided');
const config = loadConfig({ ...process.env, DB_PASSWORD: password });
if (!config.database) throw new Error('Database settings are missing');
const database = createPool(config.database);
const temporary = '.database-password-' + randomBytes(12).toString('hex');
try {
  await database.query('SELECT 1');
  console.log('Database connection verified.');
  const auth = createAuth({ config, database, sender: delivery(config) });
  const plan = await getMigrations(auth.options);
  await plan.runMigrations();
  const remaining = await getMigrations(auth.options);
  if (remaining.toBeCreated.length || remaining.toBeAdded.length || remaining.toBeAddedIndexes.length) throw new Error('Schema verification failed');
  console.log('Database migrations completed and schema verified.');
  writeFileSync(temporary, password, { mode: 0o600, flag: 'wx' });
  renameSync(temporary, '.database-password');
  console.log('Password saved privately with owner-only permissions.');
  mkdirSync('tmp', { recursive: true });
  closeSync(openSync('tmp/restart.txt', 'w'));
  console.log('Application restart requested.');
} catch (error) {
  if (existsSync(temporary)) unlinkSync(temporary);
  console.error('Setup failed:', error.code || error.name);
  console.error('Setup did not complete. Check your database credentials and try again. No password has been printed.');
  process.exitCode = 1;
} finally { await database.end(); }
