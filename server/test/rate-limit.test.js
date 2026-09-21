import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit } from '../src/rate-limit.js';

function run(middleware, ip) {
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      status(code) {
        this.code = code;
        return this;
      },
      json() {
        resolve({ blocked: true, code: this.code, headers: this.headers });
      },
    };
    middleware({ ip }, res, () => resolve({ blocked: false }));
  });
}

test('allows up to `max` requests per window, then answers 429', async () => {
  const limiter = rateLimit({ name: 't', windowMs: 60_000, max: 3 });
  for (let i = 0; i < 3; i++) assert.equal((await run(limiter, '1.1.1.1')).blocked, false);
  const fourth = await run(limiter, '1.1.1.1');
  assert.equal(fourth.blocked, true);
  assert.equal(fourth.code, 429);
  assert.ok(fourth.headers['Retry-After']);
});

test('limits are tracked per client address', async () => {
  const limiter = rateLimit({ name: 't', windowMs: 60_000, max: 1 });
  assert.equal((await run(limiter, '1.1.1.1')).blocked, false);
  assert.equal((await run(limiter, '2.2.2.2')).blocked, false);
  assert.equal((await run(limiter, '1.1.1.1')).blocked, true);
});
