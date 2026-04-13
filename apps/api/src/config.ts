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
  fromEmail: process.env.FROM_EMAIL ?? process.env.SENDGRID_FROM_EMAIL ?? 'hello@credxme.com',
  leadNotificationEmail: process.env.LEAD_NOTIFICATION_EMAIL ?? process.env.ADMIN_ALERT_EMAIL ?? 'jmalloy@credxme.com'
};
