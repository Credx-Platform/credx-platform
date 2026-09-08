import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../apps/api/src', import.meta.url).pathname;
const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs)$/.test(entry)) continue;

    const source = readFileSync(path, 'utf8');
    if (!/\bcrypto\./.test(source)) continue;
    if (/import\s+crypto\s+from\s+['"](?:node:)?crypto['"]/.test(source)) continue;
    if (/const\s+crypto\s*=\s*require\(['"](?:node:)?crypto['"]\)/.test(source)) continue;

    offenders.push(path.replace(process.cwd() + '/', ''));
  }
}

walk(root);

if (offenders.length) {
  console.error('API files use crypto.* without importing node:crypto:');
  for (const offender of offenders) console.error(`- ${offender}`);
  process.exit(1);
}
