#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assertSafeDatabaseOperation } from './lib/db-safety.mjs';

const operation = process.argv[2];
const commands = {
  'migrate-deploy': ['migrate', 'deploy'],
  'migrate-status': ['migrate', 'status'],
  'migrate-dev': ['migrate', 'dev'],
  'db-push': ['db', 'push'],
};

if (!commands[operation]) {
  console.error('Unknown guarded Prisma operation');
  process.exit(2);
}

let result;
try {
  result = assertSafeDatabaseOperation(operation);
} catch (error) {
  console.error(`DATABASE SAFETY BLOCK: ${error.message}`);
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = path.join(repoRoot, 'packages/db/prisma/schema.prisma');
console.log(
  `Database safety gate passed for ${result.environment} target ` +
  `${result.target.host}:${result.target.port}/${result.target.database} ` +
  `(fingerprint ${result.target.fingerprint.slice(0, 12)}...)`,
);

const child = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', ...commands[operation], '--schema', schema],
  { cwd: repoRoot, env: process.env, stdio: 'inherit' },
);

if (child.error) {
  console.error(child.error.message);
  process.exit(1);
}
process.exit(child.status ?? 1);
