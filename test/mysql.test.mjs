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
  const config = loadConfig({ AUTH_BASE_URL: 'http://localhost:3000', SIGNUP_APPROVAL_REQUIRED:'false' });
  const auth = createAuth({ config, database, sender: { emailEnabled: true, smsEnabled: false, email: async data => deliveries.push(data) } });
  try {
    await (await getMigrations(auth.options)).runMigrations();
    const signup = await auth.api.signUpEmail({ body: { name: 'MySQL Test', email: 'mysql@example.test', username: 'mysql_test', password: 'A MySQL test password 123!' } });
    assert.ok(signup.user.id);
    const verified = await auth.api.verifyEmailOTP({ body: { email: 'mysql@example.test', otp: deliveries.at(-1).otp } });
    assert.equal(verified.user.id, signup.user.id);
    const login = await auth.api.signInUsername({ body: { username: 'mysql_test', password: 'A MySQL test password 123!' } });
    assert.equal(login.user.id, signup.user.id);
    const signed=await auth.handler(new Request(config.baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:config.baseURL,'Content-Type':'application/json'},body:JSON.stringify({username:'mysql_test',password:'A MySQL test password 123!'})}));
    assert.equal(signed.status,200);const bearer=signed.headers.get('set-auth-token');assert.ok(bearer);
    const reauthHeaders={Origin:config.baseURL,'Content-Type':'application/json',Authorization:'Bearer '+bearer};
    const checked=await auth.handler(new Request(config.baseURL+'/api/auth/get-session',{headers:reauthHeaders}));
    assert.equal(checked.status,200);const checkedSession=(await checked.json()).session;
    const [beforeActivity]=await database.execute('SELECT expiresAt FROM session WHERE id=?',[checkedSession.id]);
    await database.execute('UPDATE session SET lastActiveAt=NULL WHERE id=?',[checkedSession.id]);
    assert.equal((await auth.handler(new Request(config.baseURL+'/api/auth/get-session',{headers:reauthHeaders}))).status,200);
    const [afterActivity]=await database.execute('SELECT expiresAt,lastActiveAt FROM session WHERE id=?',[checkedSession.id]);
    assert.ok(afterActivity[0].lastActiveAt);assert.equal(afterActivity[0].expiresAt.getTime(),beforeActivity[0].expiresAt.getTime());
    const issued=await auth.handler(new Request(config.baseURL+'/api/auth/reauthenticate',{method:'POST',headers:reauthHeaders,body:JSON.stringify({origin:'https://mysql-site.example',action:'settings:change',password:'A MySQL test password 123!'})}));
    assert.equal(issued.status,200);const proof=await issued.json();
    const consume=()=>auth.handler(new Request(config.baseURL+'/api/auth/reauthentication/consume',{method:'POST',headers:reauthHeaders,body:JSON.stringify({origin:'https://mysql-site.example',action:'settings:change',proof:proof.proof})}));
    assert.equal((await consume()).status,200);assert.equal((await consume()).status,403);
    const next = await getMigrations(auth.options);
    assert.equal(next.toBeCreated.length, 0);
    assert.equal(next.toBeAdded.length, 0);
  } finally { await database.end(); }
});
