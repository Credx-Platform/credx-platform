import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './prisma.js';

const TOKEN_BYTES = 32;
const DEFAULT_TTL_HOURS = 72;

export type TokenPurpose = 'setup' | 'reset';

function hashToken(rawToken: string) {
  return createHash('sha256').update(rawToken).digest('hex');
}

export async function issuePasswordSetupToken(params: {
  userId: string;
  purpose?: TokenPurpose;
  ttlHours?: number;
}) {
  const ttlHours = params.ttlHours ?? DEFAULT_TTL_HOURS;
  const rawToken = randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  const record = await prisma.passwordSetupToken.create({
    data: {
      userId: params.userId,
      tokenHash,
      purpose: params.purpose ?? 'setup',
      expiresAt
    }
  });

  return { rawToken, expiresAt, id: record.id };
}

export async function findActiveTokenRecord(rawToken: string) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordSetupToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });
  if (!record) return null;
  if (record.consumedAt) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;
  return record;
}

export async function consumeToken(tokenId: string) {
  await prisma.passwordSetupToken.update({
    where: { id: tokenId },
    data: { consumedAt: new Date() }
  });
}

export function buildPasswordSetupLink(appUrl: string, rawToken: string) {
  const base = appUrl.replace(/\/$/, '');
  return `${base}/portal/set-password?token=${encodeURIComponent(rawToken)}`;
}
