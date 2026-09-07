import { prisma } from './prisma.js';

/**
 * Webhook event ledger with idempotency support.
 * All incoming webhooks should flow through here.
 */

export interface WebhookPayload {
  source: string;      // 'stripe', 'paypal', 'docusign', etc.
  eventType: string;   // 'invoice.payment_succeeded', etc.
  payload: Record<string, unknown>;
  externalEventId?: string; // idempotency key from provider
  signature?: string;  // raw signature header
}

/**
 * Record an incoming webhook event.
 * Returns existing event if already processed (idempotency).
 */
export async function recordWebhookEvent(input: WebhookPayload) {
  // Idempotency: if externalEventId exists and we already have it, return existing
  if (input.externalEventId) {
    const existing = await prisma.webhookEvent.findUnique({
      where: { externalEventId: input.externalEventId }
    });
    if (existing) {
      return { event: existing, isDuplicate: true };
    }
  }

  const event = await prisma.webhookEvent.create({
    data: {
      source: input.source,
      eventType: input.eventType,
      payload: input.payload as any,
      externalEventId: input.externalEventId ?? null,
      signature: input.signature ?? null,
      status: 'RECEIVED'
    }
  });

  return { event, isDuplicate: false };
}

/**
 * Validate a webhook signature (placeholder — implement per-provider).
 */
export async function validateWebhookEvent(
  eventId: string,
  validator: (payload: Record<string, unknown>, signature?: string) => boolean | Promise<boolean>
): Promise<boolean> {
  const event = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  if (!event) return false;
  if (event.status !== 'RECEIVED') return true; // already validated

  try {
    const isValid = await validator(event.payload as Record<string, unknown>, event.signature ?? undefined);
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: { status: isValid ? 'VALIDATED' : 'FAILED', errorMessage: isValid ? null : 'Signature validation failed' }
    });
    return isValid;
  } catch (err) {
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: { status: 'FAILED', errorMessage: (err as Error).message }
    });
    return false;
  }
}

/**
 * Mark a webhook event as being processed.
 */
export async function beginProcessing(eventId: string) {
  return prisma.webhookEvent.update({
    where: { id: eventId },
    data: { status: 'PROCESSING' }
  });
}

/**
 * Mark a webhook event as fully processed.
 */
export async function markProcessed(eventId: string) {
  return prisma.webhookEvent.update({
    where: { id: eventId },
    data: { status: 'PROCESSED', processedAt: new Date() }
  });
}

/**
 * Mark a webhook event as failed with retry.
 */
export async function markFailed(eventId: string, error: string) {
  const event = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  if (!event) return null;

  const retryCount = event.retryCount + 1;
  const status = retryCount >= 5 ? 'DEAD_LETTER' : 'RETRYING';

  return prisma.webhookEvent.update({
    where: { id: eventId },
    data: {
      status,
      retryCount,
      errorMessage: error.slice(0, 4000)
    }
  });
}

/**
 * Idempotency key guard for any operation.
 */
export async function withIdempotencyKey<T>(
  key: string,
  scope: string,
  operation: () => Promise<T>,
  ttlSeconds = 86400
): Promise<T> {
  const existing = await prisma.idempotencyKey.findUnique({
    where: { key }
  });

  if (existing) {
    if (existing.response) {
      return existing.response as T;
    }
    // Key exists but no response yet — another process is working on it
    throw new Error(`Idempotency key ${key} is already in use`);
  }

  await prisma.idempotencyKey.create({
    data: {
      key,
      scope,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000)
    }
  });

  try {
    const result = await operation();
    await prisma.idempotencyKey.update({
      where: { key },
      data: {
        response: result as any,
        payloadHash: null
      }
    });
    return result;
  } catch (err) {
    // Don't delete the key on error — let it expire naturally to prevent thundering herd
    throw err;
  }
}

/**
 * Clean up expired idempotency keys.
 */
export async function cleanupExpiredIdempotencyKeys() {
  const result = await prisma.idempotencyKey.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });
  return result.count;
}
