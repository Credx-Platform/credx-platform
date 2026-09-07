import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(currentDir, '..');
const repoRoot = resolve(currentDir, '../../..');
const nodeEnv = process.env.NODE_ENV ?? 'development';

[
  resolve(repoRoot, '.env'),
  resolve(repoRoot, `.env.${nodeEnv}`),
  resolve(repoRoot, '.env.local'),
  resolve(apiRoot, '.env'),
  resolve(apiRoot, `.env.${nodeEnv}`),
  resolve(apiRoot, '.env.local')
].forEach((path) => {
  if (existsSync(path)) {
    dotenv.config({ path, override: false });
  }
});

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function assertProductionSafe(name: string, value: string, invalidValues: string[] = []): string {
  if (nodeEnv !== 'production') return value;

  const normalized = value.trim().toLowerCase();
  if (!normalized || invalidValues.map((item) => item.trim().toLowerCase()).includes(normalized)) {
    throw new Error(`Unsafe production env var: ${name}`);
  }

  return value;
}

function assertProductionUrl(name: string, value: string): string {
  if (nodeEnv !== 'production') return value;

  if (/localhost|127\.0\.0\.1/i.test(value)) {
    throw new Error(`Invalid production URL for ${name}: ${value}`);
  }

  return value;
}

const jwtSecret = assertProductionSafe('JWT_SECRET', required('JWT_SECRET', 'change-me'), ['change-me']);
const appUrl = assertProductionUrl('APP_URL', required('APP_URL', 'http://localhost:5173'));
const apiUrl = assertProductionUrl('API_URL', required('API_URL', 'http://localhost:3000'));
const defaultBusinessEmail = process.env.BUSINESS_EMAIL ?? 'contact@credxme.com';

export const config = {
  nodeEnv,
  port: Number(process.env.PORT ?? 3000),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  appUrl,
  apiUrl,
  businessName: process.env.BUSINESS_NAME ?? 'CredX',
  cancellationWindowHours: Number(process.env.CANCELLATION_WINDOW_HOURS ?? 72),
  contractPath: process.env.CONTRACT_PATH ?? '/contract',
  businessEmail: defaultBusinessEmail,
  fromEmail: process.env.FROM_EMAIL ?? process.env.SENDGRID_FROM_EMAIL ?? defaultBusinessEmail,
  leadNotificationEmail: process.env.LEAD_NOTIFICATION_EMAIL ?? process.env.ADMIN_ALERT_EMAIL ?? defaultBusinessEmail,
  // SaaS Upgrade: Sentry / monitoring
  sentryDsn: process.env.SENTRY_DSN,
  sentryEnabled: process.env.SENTRY_ENABLED === 'true' || !!process.env.SENTRY_DSN,
  // SaaS Upgrade: Redis / queue (optional — falls back to DB queue)
  redisUrl: process.env.REDIS_URL,
  // SaaS Upgrade: product analytics (optional — no-ops when unset)
  analyticsEnabled: process.env.ANALYTICS_ENABLED === 'true' || !!process.env.POSTHOG_API_KEY,
  posthogApiKey: process.env.POSTHOG_API_KEY,
  posthogHost: process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
  // SaaS Upgrade: Worker identity
  workerId: process.env.WORKER_ID ?? `worker-${Date.now()}`
};
