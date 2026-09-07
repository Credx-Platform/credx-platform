#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    shell: false
  });

  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || `${command} failed`).trim().slice(0, 500)
    };
  }

  try {
    return { ok: true, data: JSON.parse(result.stdout || '{}') };
  } catch {
    return { ok: false, error: 'Command returned non-JSON output.' };
  }
}

function messageSummary(emailResult, signupResult) {
  const lines = ['CredX onboarding check'];

  if (!emailResult.ok) {
    lines.push(`- Inbox check failed: ${emailResult.error}`);
  } else {
    const messages = Array.isArray(emailResult.data.newMessages) ? emailResult.data.newMessages : [];
    if (emailResult.data.initialized) lines.push('- Inbox watcher initialized; no historical emails sent.');
    else if (!messages.length) lines.push('- No new onboarding emails.');
    else {
      lines.push(`- ${messages.length} new onboarding email${messages.length === 1 ? '' : 's'}:`);
      for (const msg of messages.slice(0, 5)) {
        lines.push(`  - ${msg.subject || '(no subject)'} from ${msg.from || 'unknown sender'}`);
      }
    }
  }

  if (!signupResult.ok) {
    lines.push(`- Signup watcher failed: ${signupResult.error}`);
  } else if (signupResult.data.message) {
    lines.push(`- ${signupResult.data.message}`);
  } else {
    lines.push('- No new CredX signups.');
  }

  lines.push('- Next action: review only if a new email, lead, or blocker is listed above.');
  return lines.join('\n');
}

const emailResult = run('bash', ['scripts/check-namecheap-inbox-local.sh']);
const signupResult = run('node', ['scripts/credx-ops-cron.mjs', 'signup-watch']);

console.log(messageSummary(emailResult, signupResult));
