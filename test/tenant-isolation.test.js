const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createSessionToken, sessionMiddleware } = require('../lib/auth');

process.env.DEV_MODE = 'false';
process.env.SESSION_SECRET = 'isolated-test-secret';

function authenticate(authorization, cookie) {
  const req = { headers: { authorization, cookie } };
  const res = { status(code) { this.code = code; return this; }, json() {} };
  let accepted = false;
  sessionMiddleware(req, res, () => { accepted = true; });
  return { accepted, merchantId: req.merchantId, status: res.code };
}

test('two merchant sessions stay isolated even with a shared cookie', () => {
  const a = createSessionToken('merchant-a');
  const b = createSessionToken('merchant-b');
  assert.equal(authenticate(`Bearer ${a}`, `aoleva_session=${b}`).merchantId, 'merchant-a');
  assert.equal(authenticate(`Bearer ${b}`, `aoleva_session=${a}`).merchantId, 'merchant-b');
  assert.equal(authenticate(`Bearer ${a}`, `aoleva_session=${b}`).merchantId, 'merchant-a');
});

test('missing or forged authorization never falls back to cookie identity', () => {
  const cookie = `aoleva_session=${createSessionToken('other-store')}`;
  for (const header of ['', 'Bearer invalid', 'Bearer ' + createSessionToken('a') + 'tampered']) {
    assert.equal(authenticate(header, cookie).status, 401);
  }
});

test('expired sessions are rejected', () => {
  const original = Date.now;
  let token;
  try {
    Date.now = () => original() - 9 * 60 * 60 * 1000;
    token = createSessionToken('a');
  } finally { Date.now = original; }
  assert.equal(authenticate(`Bearer ${token}`, '').status, 401);
});

test('channel ownership conflict rolls back before merchant mutation', async () => {
  const queries = [];
  let released = false;
  const client = {
    async query(sql) {
      queries.push(sql);
      return { rows: sql.includes('SELECT merchant_id') ? [{ merchant_id: 'other' }] : [] };
    },
    release() { released = true; }
  };
  class Pool { on() {} async connect() { return client; } }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../lib/state'), 'utf8'), {
    module, require: name => name === 'pg' ? { Pool } : require(name),
    process: { env: { DATABASE_URL: 'postgres://test' } }, console
  });
  let mutated = false;
  await assert.rejects(
    module.exports.updateStore('a', () => { mutated = true; }, { uniqueWhatsappInstance: '123' }),
    error => error.statusCode === 409
  );
  assert.equal(mutated, false);
  assert.ok(queries[1].includes('pg_advisory_xact_lock'));
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.equal(released, true);
});
