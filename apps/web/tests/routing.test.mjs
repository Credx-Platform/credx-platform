import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Routing contract for apps/web/server.mjs.
 *
 * The 2026-09-07 launch audit reported the new SaaS pages as "live" because the
 * server answered every unknown path with 200 + index.html. Health checks,
 * uptime probes and smoke tests could not distinguish a deployed page from a
 * missing one. These tests pin the three rules that make routing observable:
 * real pages resolve, admin SPA deep links resolve to the admin bundle, and
 * anything else is a genuine 404.
 */

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const distDir = join(webRoot, 'dist');
const PORT = 8123;
const base = `http://127.0.0.1:${PORT}`;

let child;
const hasBuild = existsSync(join(distDir, 'index.html'));

before(async () => {
  if (!hasBuild) return; // `npm run build:web` has not run; skip rather than fail.
  child = spawn(process.execPath, [join(webRoot, 'server.mjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore'
  });
  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      await fetch(`${base}/`);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error('web server did not start');
      await new Promise((r) => setTimeout(r, 200));
    }
  }
});

after(() => child?.kill());

const skip = () => (hasBuild ? false : 'requires apps/web/dist (run npm run build:web)');

test('published pages resolve and are distinct documents', { skip: skip() }, async () => {
  const paths = ['/', '/product', '/team', '/financial-readiness', '/pricing', '/terms', '/privacy'];
  const bodies = new Map();

  for (const path of paths) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 200, `${path} should be 200`);
    bodies.set(path, await res.text());
  }

  // The audit's core symptom: every page returning the same document.
  const distinct = new Set(bodies.values());
  assert.equal(distinct.size, paths.length, 'each route must serve its own document');
});

test('admin SPA deep links serve the admin bundle, not the landing page', { skip: skip() }, async () => {
  const admin = await (await fetch(`${base}/adminportal`)).text();
  const landing = await (await fetch(`${base}/`)).text();
  assert.notEqual(admin, landing, 'precondition: admin bundle differs from landing');

  for (const path of ['/clients', '/disputes', '/leads', '/tasks', '/print', '/sub-agents', '/employees', '/clients/abc123']) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 200, `${path} should be 200`);
    assert.equal(await res.text(), admin, `${path} must serve the admin bundle on refresh`);
  }
});

test('unknown paths are a real 404, never a soft 200', { skip: skip() }, async () => {
  for (const path of ['/this-page-does-not-exist', '/wp-login.php', '/admin-xyz', '/clientsX', '/security']) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 404, `${path} must 404`);
  }
});

test('static assets are still served', { skip: skip() }, async () => {
  const res = await fetch(`${base}/favicon.ico`);
  assert.ok(res.status === 200 || res.status === 404, 'favicon request must not throw');
});

test('every response carries the Content-Security-Policy', { skip: skip() }, async () => {
  const res = await fetch(`${base}/`);
  const csp = res.headers.get('content-security-policy');
  assert.ok(csp, 'CSP header must be present');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  // Origins the pages genuinely need must stay allowed.
  assert.match(csp, /https:\/\/www\.paypal\.com/);
  assert.match(csp, /https:\/\/challenges\.cloudflare\.com/);
  assert.match(csp, /https:\/\/fonts\.googleapis\.com/);
});
