import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSafeDatabaseOperation,
  describeDatabaseTarget,
} from '../lib/db-safety.mjs';

const PROD_URL = 'postgresql://runtime:secret@prod.example:5432/credx';
const STAGING_URL = 'postgresql://runtime:secret@staging.example:5432/credx_staging';
const PROD_FINGERPRINT = describeDatabaseTarget(PROD_URL).fingerprint;

test('fingerprint excludes credentials', () => {
  const first = describeDatabaseTarget(PROD_URL).fingerprint;
  const rotated = describeDatabaseTarget(
    'postgresql://different:new-secret@prod.example:5432/credx',
  ).fingerprint;
  assert.equal(first, rotated);
});

test('fails closed when environment classification is missing', () => {
  assert.throws(
    () => assertSafeDatabaseOperation('migrate-status', { DATABASE_URL: STAGING_URL }),
    /CREDX_DATABASE_ENVIRONMENT/,
  );
});

test('permanently denies destructive production operations', () => {
  for (const operation of ['db-push', 'migrate-dev', 'migrate-reset', 'drop-schema']) {
    assert.throws(
      () => assertSafeDatabaseOperation(operation, {
        DATABASE_URL: PROD_URL,
        CREDX_DATABASE_ENVIRONMENT: 'production',
        CREDX_PRODUCTION_DATABASE_FINGERPRINT: PROD_FINGERPRINT,
      }),
      /blocked against production/,
    );
  }
});

test('denies a mislabeled target when it matches production', () => {
  assert.throws(
    () => assertSafeDatabaseOperation('db-push', {
      DATABASE_URL: PROD_URL,
      CREDX_DATABASE_ENVIRONMENT: 'staging',
      CREDX_ALLOW_DESTRUCTIVE: 'DISPOSABLE_DATABASE_CONFIRMED',
      CREDX_PRODUCTION_DATABASE_FINGERPRINT: PROD_FINGERPRINT,
    }),
    /matches the production fingerprint/,
  );
});

test('requires approval and a fresh verified backup for production migration', () => {
  const base = {
    DATABASE_URL: PROD_URL,
    CREDX_DATABASE_ENVIRONMENT: 'production',
    CREDX_PRODUCTION_DATABASE_FINGERPRINT: PROD_FINGERPRINT,
  };
  assert.throws(() => assertSafeDatabaseOperation('migrate-deploy', base), /approval/);
  assert.throws(
    () => assertSafeDatabaseOperation('migrate-deploy', {
      ...base,
      CREDX_PRODUCTION_CHANGE_APPROVAL: 'APPROVED',
    }),
    /checksum/,
  );
});

test('allows an approved production migration with a fresh restore-tested backup', () => {
  const now = Date.parse('2026-09-08T00:00:00Z');
  const result = assertSafeDatabaseOperation('migrate-deploy', {
    DATABASE_URL: PROD_URL,
    CREDX_DATABASE_ENVIRONMENT: 'production',
    CREDX_PRODUCTION_DATABASE_FINGERPRINT: PROD_FINGERPRINT,
    CREDX_PRODUCTION_CHANGE_APPROVAL: 'APPROVED',
    CREDX_VERIFIED_BACKUP_SHA256: 'a'.repeat(64),
    CREDX_VERIFIED_BACKUP_AT: '2026-09-07T23:30:00Z',
  }, now);
  assert.equal(result.environment, 'production');
});

test('allows destructive operations only on explicitly disposable non-production databases', () => {
  const result = assertSafeDatabaseOperation('db-push', {
    DATABASE_URL: STAGING_URL,
    CREDX_DATABASE_ENVIRONMENT: 'staging',
    CREDX_ALLOW_DESTRUCTIVE: 'DISPOSABLE_DATABASE_CONFIRMED',
    CREDX_PRODUCTION_DATABASE_FINGERPRINT: PROD_FINGERPRINT,
  });
  assert.equal(result.environment, 'staging');
});
