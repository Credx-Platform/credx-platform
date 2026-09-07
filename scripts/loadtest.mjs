#!/usr/bin/env node
/**
 * Zero-dependency load-test harness for a LOCAL CredX API instance.
 *
 * HARD RULE: refuses to run against anything that is not localhost / a private
 * address. Never point this at production.
 *
 * Usage:
 *   node scripts/loadtest.mjs [scenario] [--users N] [--duration S] [--target URL] [--token JWT]
 *   npm run loadtest -- mixed --users 100 --duration 20
 *
 * Scenarios:
 *   health    GET /health, /health/db, /health/queue         (default)
 *   readonly  health + GET /api/billing/plans + GET /
 *   authed    readonly + GET /api/progress/me + /api/funding-readiness   (needs --token)
 *   mixed     weighted blend of the above
 */

import { argv, exit } from 'node:process';

function parseArgs() {
  const args = argv.slice(2);
  const opts = { scenario: 'health', users: 50, duration: 15, target: process.env.LOADTEST_TARGET || 'http://localhost:3000', token: process.env.LOADTEST_TOKEN || '' };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a.startsWith('--') && i === 0) { opts.scenario = a; continue; }
    if (a === '--users') opts.users = Number(args[++i]);
    else if (a === '--duration') opts.duration = Number(args[++i]);
    else if (a === '--target') opts.target = args[++i];
    else if (a === '--token') opts.token = args[++i];
    else if (!a.startsWith('--')) opts.scenario = a;
  }
  return opts;
}

function assertLocalTarget(target) {
  let host;
  try { host = new URL(target).hostname; } catch { console.error(`Invalid --target: ${target}`); exit(1); }
  const local =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (!local) {
    console.error(`\nRefusing to load-test a non-local host: ${host}`);
    console.error('This harness is for local instances only. Never run it against production.\n');
    exit(2);
  }
}

const SCENARIOS = {
  health: [
    { m: 'GET', p: '/health' },
    { m: 'GET', p: '/health/db' },
    { m: 'GET', p: '/health/queue' }
  ],
  readonly: [
    { m: 'GET', p: '/health' },
    { m: 'GET', p: '/' },
    { m: 'GET', p: '/api/billing/plans' }
  ],
  authed: [
    { m: 'GET', p: '/api/progress/me', auth: true },
    { m: 'GET', p: '/api/funding-readiness', auth: true },
    { m: 'GET', p: '/api/business-credit', auth: true }
  ]
};
SCENARIOS.mixed = [...SCENARIOS.health, ...SCENARIOS.readonly, ...SCENARIOS.authed];

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main() {
  const opts = parseArgs();
  assertLocalTarget(opts.target);

  let requests = (SCENARIOS[opts.scenario] || SCENARIOS.health);
  if (!opts.token) requests = requests.filter((r) => !r.auth);
  if (!requests.length) { console.error('No runnable requests (authed scenario needs --token).'); exit(1); }

  console.log(`\nCredX load test — scenario=${opts.scenario} users=${opts.users} duration=${opts.duration}s target=${opts.target}`);
  console.log(`endpoints: ${requests.map((r) => `${r.m} ${r.p}`).join(', ')}\n`);

  const latencies = [];
  const statusCounts = {};
  let errors = 0;
  let done = 0;
  const endAt = Date.now() + opts.duration * 1000;
  let rr = 0;

  async function worker() {
    while (Date.now() < endAt) {
      const spec = requests[rr++ % requests.length];
      const started = performance.now();
      try {
        const res = await fetch(`${opts.target}${spec.p}`, {
          method: spec.m,
          headers: spec.auth ? { authorization: `Bearer ${opts.token}` } : {}
        });
        await res.arrayBuffer();
        latencies.push(performance.now() - started);
        statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
        if (res.status >= 500) errors += 1;
      } catch (err) {
        errors += 1;
        statusCounts.ERR = (statusCounts.ERR || 0) + 1;
      }
      done += 1;
    }
  }

  const t0 = performance.now();
  await Promise.all(Array.from({ length: Math.max(1, opts.users) }, worker));
  const wallSeconds = (performance.now() - t0) / 1000;

  latencies.sort((a, b) => a - b);
  const report = {
    scenario: opts.scenario,
    users: opts.users,
    durationRequested: opts.duration,
    wallSeconds: Number(wallSeconds.toFixed(2)),
    requests: done,
    rps: Number((done / wallSeconds).toFixed(1)),
    errors,
    errorRate: Number(((errors / Math.max(1, done)) * 100).toFixed(2)),
    latencyMs: {
      p50: Number(percentile(latencies, 50).toFixed(1)),
      p90: Number(percentile(latencies, 90).toFixed(1)),
      p95: Number(percentile(latencies, 95).toFixed(1)),
      p99: Number(percentile(latencies, 99).toFixed(1)),
      max: Number((latencies[latencies.length - 1] || 0).toFixed(1))
    },
    statusCounts
  };

  console.log(JSON.stringify(report, null, 2));
  if (report.errorRate > 1) {
    console.error(`\nFAIL: error rate ${report.errorRate}% exceeds 1% threshold.`);
    exit(1);
  }
  console.log('\nOK');
}

main().catch((err) => { console.error(err); exit(1); });
