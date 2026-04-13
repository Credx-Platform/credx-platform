function formatField(value: string | null | undefined, fallback = 'Not provided'): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function buildSignupAlertMessage(signup: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  source?: string | null;
  createdAt?: string | null;
}): string {
  const name = [signup.firstName, signup.lastName].filter(Boolean).join(' ').trim() || 'Not provided';

  return [
    'You are the CredX onboarding agent reacting to a brand-new client signup.',
    'Return ONLY a concise owner alert for Telegram, 8 lines max.',
    'Do not invent credit report, dispute, billing, or dashboard data.',
    'Include current stage and the next onboarding action needed from the client or team.',
    '',
    `Name: ${name}`,
    `Email: ${formatField(signup.email)}`,
    `Phone: ${formatField(signup.phone)}`,
    `Source: ${formatField(signup.source, 'credx-platform-api-register')}`,
    `Signed up: ${formatField(signup.createdAt, new Date().toISOString())}`,
    'Stage: signup received, onboarding pending',
    'Next action: complete onboarding intake and upload the current credit report'
  ].join('\n');
}

export async function notifyNewClientSignup(signup: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  source?: string | null;
  createdAt?: string | null;
}): Promise<{ ok?: boolean; skipped?: boolean; reason?: string; status?: number; error?: string }> {
  const url = process.env.OPENCLAW_SIGNUP_WEBHOOK_URL ?? '';
  if (!url) {
    return { skipped: true, reason: 'OPENCLAW_SIGNUP_WEBHOOK_URL not configured' };
  }

  const token = process.env.OPENCLAW_SIGNUP_WEBHOOK_TOKEN ?? '';
  const channel = process.env.OPENCLAW_SIGNUP_CHANNEL ?? 'telegram';
  const to = process.env.OPENCLAW_SIGNUP_TO ?? '5737613358';
  const agentId = process.env.OPENCLAW_SIGNUP_AGENT_ID ?? 'main';
  const timeoutMs = Number(process.env.OPENCLAW_SIGNUP_TIMEOUT_MS ?? 5000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        name: 'CredX New Client Signup',
        agentId,
        wakeMode: 'now',
        deliver: true,
        channel,
        to,
        message: buildSignupAlertMessage(signup)
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Hook request failed (${response.status}): ${body || response.statusText}`);
    }

    return { ok: true, status: response.status };
  } catch (error) {
    console.warn('[CredX API] signup alert failed:', error instanceof Error ? error.message : String(error));
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}
