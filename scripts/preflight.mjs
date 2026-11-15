import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { loadConfig } from '../server/config.mjs';

let database;
try {
  const inherited = { ...process.env };
  if (existsSync('.env')) loadEnvFile('.env');
  Object.assign(process.env, inherited);
  const config = loadConfig();
  if (!config.database?.database || !config.database.user) throw new Error('Database name and user must be configured before deployment.');
  if (!config.database.password) throw new Error('DB_PASSWORD is not configured. Running application files have not been replaced.');
  const { createPool } = await import('mysql2/promise');
  database = createPool({ ...config.database, connectTimeout: 10000 });
  await database.query('SELECT 1');
  console.log('Preflight passed: configuration and database access verified.');
} catch (error) {
  // Driver error messages are not printed because they may include connection details.
  console.error('Deployment preflight failed:', error.code || error.message);
  process.exitCode = 1;
} finally {
  if (database) await database.end();
}
