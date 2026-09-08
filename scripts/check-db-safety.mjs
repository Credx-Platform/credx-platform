#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const forbidden = [
  /prisma\s+migrate\s+reset/i,
  /prisma\s+migrate\s+dev/i,
  /prisma\s+db\s+push/i,
  /--accept-data-loss/i,
  /--force-reset/i,
  /drop\s+schema/i,
];

const tracked = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean)
  .filter((file) =>
    file === 'package.json' ||
    file.endsWith('/package.json') ||
    file === 'deploy-railway-services.sh' ||
    file.startsWith('.github/workflows/') ||
    file.startsWith('railway'),
  );

const violations = [];
for (const file of tracked) {
  const contents = readFileSync(file, 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(contents)) violations.push(`${file}: ${pattern}`);
  }
}

if (violations.length) {
  console.error('Unsafe database command found in a production-capable path:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Database safety scan passed (${tracked.length} production-capable files checked)`);
