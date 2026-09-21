import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.UNSUBSCRIBE_TOKEN_SECRET ||= 'test-unsubscribe-secret';
process.env.APP_URL ||= 'https://www.credxme.com';
process.env.API_URL ||= 'https://credxapi-production.up.railway.app';

const { createUnsubscribeToken, verifyUnsubscribeToken, normalizeEmail } = await import('../src/lib/unsubscribeToken.js');
const { buildUnsubscribeUrl, buildOneClickUrl, injectUnsubscribeUrl, UNSUBSCRIBE_URL_PLACEHOLDER } = await import('../src/lib/email.js');

test('a minted token verifies back to the address it was issued for', () => {
  const token = createUnsubscribeToken('Person@Example.COM');
  assert.equal(verifyUnsubscribeToken(token), 'person@example.com');
});

test('address casing and padding do not produce different identities', () => {
  assert.equal(normalizeEmail('  Person@Example.COM '), 'person@example.com');
  assert.equal(
    verifyUnsubscribeToken(createUnsubscribeToken('  Person@Example.COM ')),
    verifyUnsubscribeToken(createUnsubscribeToken('person@example.com'))
  );
});

test('a tampered signature is rejected', () => {
  const token = createUnsubscribeToken('victim@example.com');
  const [payload, signature] = token.split('.');
  const flipped = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');
  assert.equal(verifyUnsubscribeToken(`${payload}.${flipped}`), null);
});

test('an attacker cannot swap in another address without the secret', () => {
  // The payload is only base64url, so re-encoding it is trivial -- the HMAC is
  // what stops someone unsubscribing an address they were not sent a link for.
  const token = createUnsubscribeToken('mine@example.com');
  const signature = token.split('.')[1];
  const forgedPayload = Buffer.from('someone-else@example.com', 'utf8').toString('base64url');
  assert.equal(verifyUnsubscribeToken(`${forgedPayload}.${signature}`), null);
});

test('malformed tokens are rejected rather than throwing', () => {
  for (const bad of ['', '.', 'nodot', 'a.b', '....', 'x'.repeat(300)]) {
    assert.equal(verifyUnsubscribeToken(bad), null, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test('the footer link resolves to the confirmation page, not a direct opt-out', () => {
  const url = buildUnsubscribeUrl('person@example.com');
  assert.ok(url, 'APP_URL is set, so a link must be produced');
  assert.match(url!, /^https:\/\/www\.credxme\.com\/unsubscribe\?token=/);
  // A GET on that page must not be the thing that unsubscribes, so it must not
  // point at the one-click endpoint.
  assert.ok(!url!.includes('one-click'));
});

test('one-click targets the API over HTTPS, as RFC 8058 requires', () => {
  const url = buildOneClickUrl('person@example.com');
  assert.ok(url, 'API_URL is set, so a one-click URL must be produced');
  assert.match(url!, /^https:\/\/.+\/api\/unsubscribe\/one-click\?token=/);
});

test('one-click is withheld when the API URL is not HTTPS', () => {
  const previous = process.env.API_URL;
  process.env.API_URL = 'http://localhost:3000';
  try {
    // Sending a plaintext List-Unsubscribe-Post target would be worse than
    // sending none: providers reject it and it leaks the token.
    assert.equal(buildOneClickUrl('person@example.com'), null);
  } finally {
    process.env.API_URL = previous;
  }
});

test('the token is bound to the recipient, so two people get different links', () => {
  assert.notEqual(buildUnsubscribeUrl('a@example.com'), buildUnsubscribeUrl('b@example.com'));
});

test('the placeholder is a literal that survives template rendering', () => {
  assert.equal(UNSUBSCRIBE_URL_PLACEHOLDER, '{{CREDX_UNSUBSCRIBE_URL}}');
  assert.ok(!UNSUBSCRIBE_URL_PLACEHOLDER.includes('$'), 'must not be interpolated by a template literal');
});

test('the rendered footer carries a real per-recipient link, not the placeholder', () => {
  const template = `<a href="${UNSUBSCRIBE_URL_PLACEHOLDER}">Unsubscribe</a>`;
  const rendered = injectUnsubscribeUrl(template, 'person@example.com');

  assert.ok(!rendered!.includes(UNSUBSCRIBE_URL_PLACEHOLDER), 'no placeholder may survive into a sent email');
  assert.ok(rendered!.includes(buildUnsubscribeUrl('person@example.com')!));
});

test('every occurrence is replaced, not just the first', () => {
  const template = `${UNSUBSCRIBE_URL_PLACEHOLDER} and ${UNSUBSCRIBE_URL_PLACEHOLDER}`;
  const rendered = injectUnsubscribeUrl(template, 'person@example.com');
  assert.ok(!rendered!.includes(UNSUBSCRIBE_URL_PLACEHOLDER));
});

test('with no APP_URL the footer falls back to a working mailto, never a dead link', () => {
  const previous = process.env.APP_URL;
  delete process.env.APP_URL;
  try {
    const rendered = injectUnsubscribeUrl(`<a href="${UNSUBSCRIBE_URL_PLACEHOLDER}">x</a>`, 'person@example.com');
    assert.ok(!rendered!.includes(UNSUBSCRIBE_URL_PLACEHOLDER));
    assert.match(rendered!, /mailto:.+unsubscribe/);
  } finally {
    process.env.APP_URL = previous;
  }
});

test('bodies without a placeholder are passed through untouched', () => {
  assert.equal(injectUnsubscribeUrl('<p>plain</p>', 'person@example.com'), '<p>plain</p>');
  assert.equal(injectUnsubscribeUrl(undefined, 'person@example.com'), undefined);
});
