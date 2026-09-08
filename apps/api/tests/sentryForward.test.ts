import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrubText, scrubDeep, sentryForwardingEnabled, forwardToSentry } from '../src/lib/sentryForward.js';

test('sentry forwarding is disabled without a DSN', () => {
  assert.equal(sentryForwardingEnabled(), false);
});

test('forwardToSentry is a no-op (never throws) when unconfigured', async () => {
  await forwardToSentry({ eventId: 'x', level: 'error', environment: 'test', error: new Error('boom') });
});

test('scrubText redacts emails, SSNs, JWTs and bearer tokens', () => {
  const raw = 'user a@b.com failed with 123-45-6789 token eyJhbGc.def.ghi and Authorization: Bearer abc.def-ghi';
  const out = scrubText(raw);
  assert.doesNotMatch(out, /a@b\.com/);
  assert.doesNotMatch(out, /123-45-6789/);
  assert.doesNotMatch(out, /eyJhbGc\.def\.ghi/);
  assert.doesNotMatch(out, /Bearer abc/);
  assert.match(out, /redacted/);
});

test('scrubDeep redacts blocked keys and scrubs nested string values', () => {
  const out = scrubDeep({
    ssn: '123-45-6789',
    password: 'hunter2',
    einLast4: '1234',
    nested: { authorization: 'Bearer zzz', note: 'contact me at x@y.com' },
    safe: 'ok'
  }) as any;
  assert.equal(out.ssn, '[redacted]');
  assert.equal(out.password, '[redacted]');
  assert.equal(out.einLast4, '[redacted]');
  assert.equal(out.nested.authorization, '[redacted]');
  assert.doesNotMatch(out.nested.note, /x@y\.com/);
  assert.equal(out.safe, 'ok');
});

test('scrubDeep caps recursion depth', () => {
  const deep: any = {};
  let cur = deep;
  for (let i = 0; i < 20; i += 1) { cur.next = {}; cur = cur.next; }
  const out = JSON.stringify(scrubDeep(deep));
  assert.match(out, /max-depth/);
});
