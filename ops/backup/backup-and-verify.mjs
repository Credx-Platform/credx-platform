#!/usr/bin/env node
import { createWriteStream, mkdirSync, openSync, closeSync, statSync, unlinkSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

const BACKUP_DIR = process.env.CREDX_BACKUP_DIR || '/home/ubuntu/backups/credx-db/offsite';
const RAILWAY_BIN = process.env.RAILWAY_BIN || '/home/ubuntu/.npm-global/bin/railway';
const PROJECT_ID = process.env.CREDX_RAILWAY_PROJECT_ID;
const PG_SERVICE = process.env.CREDX_RAILWAY_POSTGRES_SERVICE || 'Postgres-7Yzr';
const RECIPIENT = process.env.CREDX_BACKUP_GPG_RECIPIENT;
const OFFSITE_REMOTE = process.env.CREDX_BACKUP_OFFSITE_REMOTE;
const RESTORE_CONTAINER = `credx-backup-verify-${process.pid}`;

function fail(message) {
  console.error(`BACKUP SAFETY BLOCK: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status}`);
}

if (!PROJECT_ID || !RECIPIENT || !OFFSITE_REMOTE) {
  fail('project, GPG recipient, and off-site remote configuration are required');
}

for (const binary of [RAILWAY_BIN, 'docker', 'gpg', 'rclone']) {
  const probe = spawnSync(binary, ['--version'], { stdio: 'ignore' });
  if (probe.error || probe.status !== 0) fail(`${binary} is not available`);
}

const variables = spawnSync(RAILWAY_BIN, [
  'variables', '--service', PG_SERVICE, '--environment', 'production',
  '--project', PROJECT_ID, '--kv',
], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
if (variables.status !== 0) fail('could not read Railway database configuration');

const line = variables.stdout.split('\n').find((value) => value.startsWith('DATABASE_PUBLIC_URL='));
if (!line) fail('DATABASE_PUBLIC_URL was not returned by Railway');
const databaseUrl = new URL(line.slice('DATABASE_PUBLIC_URL='.length));
variables.stdout = '';

const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
const dumpPath = path.join(BACKUP_DIR, `credx-prod-${timestamp}.dump`);
const encryptedPath = `${dumpPath}.gpg`;
const checksumPath = `${encryptedPath}.sha256`;
const dumpFd = openSync(dumpPath, 'wx', 0o600);

try {
  const dump = spawn('docker', [
    'run', '--rm', '-e', 'PGPASSWORD', 'postgres:18',
    'pg_dump', '--format=custom', '--no-owner', '--no-privileges',
    '--host', databaseUrl.hostname,
    '--port', databaseUrl.port || '5432',
    '--username', decodeURIComponent(databaseUrl.username),
    '--dbname', decodeURIComponent(databaseUrl.pathname.slice(1)),
  ], {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(databaseUrl.password) },
    stdio: ['ignore', dumpFd, 'inherit'],
  });
  const [code] = await once(dump, 'close');
  closeSync(dumpFd);
  if (code !== 0) throw new Error(`pg_dump failed with exit ${code}`);
  if (statSync(dumpPath).size < 1024) throw new Error('dump is unexpectedly small');

  run('docker', ['run', '--rm', '-d', '--name', RESTORE_CONTAINER,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:18']);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const probe = spawnSync('docker', ['exec', RESTORE_CONTAINER, 'pg_isready', '-U', 'postgres'],
      { stdio: 'ignore' });
    if (probe.status === 0) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error('restore-test database did not become ready');

  const restoreInput = openSync(dumpPath, 'r');
  const restore = spawnSync('docker', ['exec', '-i', RESTORE_CONTAINER,
    'pg_restore', '--no-owner', '--no-privileges', '-U', 'postgres', '-d', 'postgres'],
    { stdio: [restoreInput, 'inherit', 'inherit'] });
  closeSync(restoreInput);
  if (restore.status !== 0) throw new Error(`pg_restore failed with exit ${restore.status}`);

  run('docker', ['exec', RESTORE_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-c',
    "SELECT count(*) AS public_tables FROM pg_tables WHERE schemaname='public';"]);

  run('gpg', ['--batch', '--yes', '--trust-model', 'always', '--recipient', RECIPIENT,
    '--output', encryptedPath, '--encrypt', dumpPath]);
  const checksum = spawnSync('sha256sum', [encryptedPath], { encoding: 'utf8' });
  if (checksum.status !== 0) throw new Error('sha256sum failed');
  const checksumOut = createWriteStream(checksumPath, { mode: 0o600, flags: 'wx' });
  checksumOut.end(checksum.stdout);
  await once(checksumOut, 'close');

  run('rclone', ['copyto', encryptedPath, `${OFFSITE_REMOTE}/${path.basename(encryptedPath)}`]);
  run('rclone', ['copyto', checksumPath, `${OFFSITE_REMOTE}/${path.basename(checksumPath)}`]);
  run('rclone', ['check', checksumPath, OFFSITE_REMOTE, '--download', '--one-way']);

  unlinkSync(dumpPath);
  console.log(`Encrypted backup uploaded and restore-tested: ${path.basename(encryptedPath)}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  spawnSync('docker', ['rm', '-f', RESTORE_CONTAINER], { stdio: 'ignore' });
  try { closeSync(dumpFd); } catch {}
}
