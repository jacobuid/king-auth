import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('deployment stops without a password and does not create or replace application files', () => {
  const folder = mkdtempSync(join(tmpdir(), 'king-auth-preflight-'));
  try {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/preflight.mjs', import.meta.url))], {
      cwd: folder, encoding: 'utf8',
      env: { NODE_ENV: 'development', DB_HOST: '127.0.0.1', DB_NAME: 'not-a-real-database', DB_USER: 'test' },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /DB_PASSWORD is not configured/);
    assert.deepEqual(readdirSync(folder), []);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
