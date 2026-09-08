import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';

async function headersFor(path: string): Promise<Record<string, string>> {
  const server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    return Object.fromEntries(res.headers.entries());
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('API responses carry a locked-down Content-Security-Policy', async () => {
  const headers = await headersFor('/health');
  const csp = headers['content-security-policy'];

  assert.ok(csp, 'CSP header must be present on API responses');
  // The API only ever returns JSON, so nothing should be loadable and no page
  // should be able to frame a response.
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /form-action 'none'/);
});

test('API keeps its existing baseline security headers', async () => {
  const headers = await headersFor('/health');
  assert.equal(headers['x-content-type-options'], 'nosniff');
});
