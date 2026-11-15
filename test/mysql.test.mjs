import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from 'mysql2/promise';
import { getMigrations } from 'better-auth/db/migration';
import { createAuth } from '../server/auth.mjs';
import { loadConfig } from '../server/config.mjs';

test('MySQL production adapter migrates and persists verified identities', { skip: !process.env.CI_MYSQL_PASSWORD }, async () => {
  // A dedicated ephemeral CI service, never the hosting database.
  const database = createPool({ host: '127.0.0.1', port: 3306, user: 'root', password: process.env.CI_MYSQL_PASSWORD, database: 'king_auth_ci_test', timezone: 'Z' });
  const deliveries = [];
  const config = loadConfig({ AUTH_BASE_URL: 'http://localhost:3000' });
  const auth = createAuth({ config, database, sender: { emailEnabled: true, smsEnabled: false, email: async data => deliveries.push(data) } });
  try {
    await (await getMigrations(auth.options)).runMigrations();
    const signup = await auth.api.signUpEmail({ body: { name: 'MySQL Test', email: 'mysql@example.test', username: 'mysql_test', password: 'A MySQL test password 123!' } });
    assert.ok(signup.user.id);
    const verified = await auth.api.verifyEmailOTP({ body: { email: 'mysql@example.test', otp: deliveries.at(-1).otp } });
    assert.equal(verified.user.id, signup.user.id);
    const login = await auth.api.signInUsername({ body: { username: 'mysql_test', password: 'A MySQL test password 123!' } });
    assert.equal(login.user.id, signup.user.id);
    const next = await getMigrations(auth.options);
    assert.equal(next.toBeCreated.length, 0);
    assert.equal(next.toBeAdded.length, 0);
  } finally { await database.end(); }
});
