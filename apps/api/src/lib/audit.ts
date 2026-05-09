import { prisma } from './prisma.js';

/**
 * Persist a row to the AuditLog table. Auditable events: auth (login,
 * password change), PII reads/writes, intake/contract submissions, payment
 * state transitions. Failures are swallowed and logged — audit writes must
 * never break the request that triggered them.
 */
export async function writeAuditLog(input: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: (input.metadata ?? null) as any
      }
    });
  } catch (err) {
    console.error('AUDIT_LOG_WRITE_FAILED', {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      error: (err as Error).message
    });
  }
}
