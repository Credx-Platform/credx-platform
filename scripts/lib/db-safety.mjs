import { createHash } from 'node:crypto';

export const DESTRUCTIVE_OPERATIONS = new Set([
  'db-push',
  'migrate-dev',
  'migrate-reset',
  'drop-schema',
  'truncate',
]);

const VALID_ENVIRONMENTS = new Set(['local', 'staging', 'production']);
const MAX_BACKUP_AGE_MS = 2 * 60 * 60 * 1000;

export function describeDatabaseTarget(rawUrl) {
  if (!rawUrl) throw new Error('DATABASE_URL is required');

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use postgres:// or postgresql://');
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!parsed.hostname || !database) {
    throw new Error('DATABASE_URL must include a host and database name');
  }

  const port = parsed.port || '5432';
  const identity = `${parsed.hostname.toLowerCase()}:${port}/${database}`;
  return {
    host: parsed.hostname.toLowerCase(),
    port,
    database,
    identity,
    fingerprint: createHash('sha256').update(identity).digest('hex'),
  };
}

function requireFreshBackup(env, now) {
  const checksum = env.CREDX_VERIFIED_BACKUP_SHA256 || '';
  if (!/^[a-f0-9]{64}$/i.test(checksum)) {
    throw new Error('Production migration denied: verified backup checksum is missing');
  }

  const verifiedAt = Date.parse(env.CREDX_VERIFIED_BACKUP_AT || '');
  if (!Number.isFinite(verifiedAt)) {
    throw new Error('Production migration denied: backup verification timestamp is missing');
  }
  if (verifiedAt > now || now - verifiedAt > MAX_BACKUP_AGE_MS) {
    throw new Error('Production migration denied: restore-tested backup is older than two hours');
  }
}

export function assertSafeDatabaseOperation(operation, env = process.env, now = Date.now()) {
  const environment = env.CREDX_DATABASE_ENVIRONMENT;
  if (!VALID_ENVIRONMENTS.has(environment)) {
    throw new Error('CREDX_DATABASE_ENVIRONMENT must be local, staging, or production');
  }

  const target = describeDatabaseTarget(env.DATABASE_URL);

  if (environment === 'production') {
    const expected = env.CREDX_PRODUCTION_DATABASE_FINGERPRINT || '';
    if (!/^[a-f0-9]{64}$/i.test(expected) || expected.toLowerCase() !== target.fingerprint) {
      throw new Error('Production database fingerprint mismatch; operation denied');
    }

    if (DESTRUCTIVE_OPERATIONS.has(operation)) {
      throw new Error(`${operation} is permanently blocked against production`);
    }

    if (operation === 'migrate-deploy') {
      if (env.CREDX_PRODUCTION_CHANGE_APPROVAL !== 'APPROVED') {
        throw new Error('Production migration denied: explicit approval is missing');
      }
      requireFreshBackup(env, now);
    }
  } else if (DESTRUCTIVE_OPERATIONS.has(operation)) {
    if (env.CREDX_ALLOW_DESTRUCTIVE !== 'DISPOSABLE_DATABASE_CONFIRMED') {
      throw new Error(`${operation} denied: disposable database confirmation is missing`);
    }

    const expectedProduction = env.CREDX_PRODUCTION_DATABASE_FINGERPRINT;
    if (expectedProduction && expectedProduction.toLowerCase() === target.fingerprint) {
      throw new Error('Target matches the production fingerprint; destructive operation denied');
    }
  }

  return { environment, target };
}
