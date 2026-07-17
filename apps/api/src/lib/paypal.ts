import type { IncomingHttpHeaders } from 'node:http';

// PayPal REST integration — education products ONLY (masterclass).
// Dispute-plan fees must NOT run through PayPal: credit repair services
// require PayPal pre-approval under their Acceptable Use Policy, and routing
// them here risks account limitation. Those bills settle via the high-risk
// processor path (/api/billing/confirm).

const PAYPAL_LIVE_API = 'https://api-m.paypal.com';
const PAYPAL_SANDBOX_API = 'https://api-m.sandbox.paypal.com';

function env() {
  return {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
    mode: (process.env.PAYPAL_ENV || 'live').toLowerCase() === 'sandbox' ? 'sandbox' : 'live'
  };
}

export function paypalEnabled(): boolean {
  const { clientId, clientSecret } = env();
  return Boolean(clientId && clientSecret);
}

export function paypalPublicConfig() {
  const { clientId, mode } = env();
  return { enabled: paypalEnabled(), clientId: paypalEnabled() ? clientId : null, mode, currency: 'USD' };
}

function apiBase(): string {
  return env().mode === 'sandbox' ? PAYPAL_SANDBOX_API : PAYPAL_LIVE_API;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const { clientId, clientSecret } = env();
  if (!clientId || !clientSecret) throw new Error('PayPal is not configured');

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) {
    throw new Error(`PayPal auth failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function paypalRequest(path: string, init?: { method?: string; body?: unknown }) {
  const token = await getAccessToken();
  const res = await fetch(`${apiBase()}${path}`, {
    method: init?.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = json?.message || json?.name || text;
    throw new Error(`PayPal ${init?.method || 'GET'} ${path} failed (${res.status}): ${detail}`);
  }
  return json;
}

export async function createPaypalOrder(input: {
  amount: number;
  currency?: string;
  description: string;
  customId: string;
  invoiceId?: string;
}) {
  return paypalRequest('/v2/checkout/orders', {
    method: 'POST',
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: input.currency || 'USD', value: input.amount.toFixed(2) },
          description: input.description,
          custom_id: input.customId,
          ...(input.invoiceId ? { invoice_id: input.invoiceId } : {})
        }
      ]
    }
  });
}

export async function capturePaypalOrder(orderId: string) {
  return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST' });
}

export async function getPaypalOrder(orderId: string) {
  return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

/**
 * Verify a webhook came from PayPal via the verify-webhook-signature API.
 * Fails closed: returns false when PAYPAL_WEBHOOK_ID is unset or headers are missing.
 */
export async function verifyPaypalWebhookSignature(headers: IncomingHttpHeaders, rawBody: string): Promise<boolean> {
  const { webhookId } = env();
  if (!webhookId) {
    console.error('PayPal webhook received but PAYPAL_WEBHOOK_ID is not set — rejecting.');
    return false;
  }

  const required = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'];
  if (required.some((h) => !headers[h])) return false;

  let webhookEvent: unknown;
  try {
    webhookEvent = JSON.parse(rawBody);
  } catch {
    return false;
  }

  const result = await paypalRequest('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: webhookEvent
    }
  });
  return result?.verification_status === 'SUCCESS';
}
