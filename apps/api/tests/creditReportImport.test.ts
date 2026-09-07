import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pullCreditScore, CreditReportImportUnavailableError } from '../src/lib/creditScoreAPI.js';

test('unverified provider import refuses to fetch or attribute consumer scores', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('must not call provider'); };
  try {
    await assert.rejects(pullCreditScore('synthetic-client'), (error: unknown) =>
      error instanceof CreditReportImportUnavailableError && error.code === 'DIRECT_REPORT_IMPORT_UNAVAILABLE');
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});
