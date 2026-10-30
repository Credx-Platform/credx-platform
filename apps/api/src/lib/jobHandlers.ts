import { registerJob } from './jobs.js';
import type { CreditAnalysis } from './creditAnalysis.js';

/**
 * Registers all background job handlers. Called once from both the API process
 * (in-process runner) and the standalone worker (src/worker.ts).
 *
 * Handlers wrap existing, already-idempotent functions. Keeping the wrappers
 * thin means the queue is purely a scheduling/retry layer — behavior is
 * identical whether a job runs queued or inline.
 */
export function registerAllJobs(): void {
  // ---- emails -------------------------------------------------------------
  registerJob({
    queue: 'emails',
    name: 'analysis-email',
    handler: async (payload) => {
      const { dispatchAnalysisEmail } = await import('./analysisEmailDispatch.js');
      const clientId = String(payload.clientId || '');
      const analysis = payload.analysis as CreditAnalysis | undefined;
      const trigger = (payload.trigger as any) || 'auto_endpoint';
      if (!clientId || !analysis) {
        return { sent: false, reason: 'missing_clientId_or_analysis' };
      }
      return dispatchAnalysisEmail({ clientId, analysis, trigger, force: payload.force === true });
    }
  });

  // ---- analysis / readiness --------------------------------------------------
  registerJob({
    queue: 'analysis',
    name: 'readiness-snapshot',
    handler: async (payload) => {
      const { generateClientReadinessSnapshot } = await import('./readinessSnapshots.js');
      const clientId = String(payload.clientId || '');
      if (!clientId) return { ok: false, reason: 'missing_clientId' };
      const snap = await generateClientReadinessSnapshot(clientId);
      return { ok: true, snapshotId: snap.id, score: snap.score };
    }
  });

  registerJob({
    queue: 'analysis',
    name: 'readiness-snapshot-all',
    handler: async () => {
      const { generateAllReadinessSnapshots } = await import('./readinessSnapshots.js');
      const results = await generateAllReadinessSnapshots();
      return { ok: true, count: results.length };
    }
  });

  // ---- reports -------------------------------------------------------------
  registerJob({
    queue: 'reports',
    name: 'generate-platform-report',
    handler: async (payload) => {
      const { generatePlatformReport } = await import('./platformReports.js');
      const reportId = String(payload.reportId || '');
      if (!reportId) return { ok: false, reason: 'missing_reportId' };
      return generatePlatformReport(reportId);
    }
  });

  // ---- privacy and security requests -------------------------------------
  // These jobs prepare and track a request. They never bypass an agency's
  // identity verification, CAPTCHA, credentials, or final authorization.
  registerJob({
    queue: 'disputes',
    name: 'prepare-privacy-security-request',
    handler: async (payload) => {
      const { prisma } = await import('./prisma.js');
      const { writeAuditLog } = await import('./audit.js');
      const actionPlanItemId = String(payload.actionPlanItemId || '');
      const clientId = String(payload.clientId || '');
      if (!actionPlanItemId || !clientId) return { prepared: false, reason: 'missing_request_identity' };

      const item = await prisma.actionPlanItem.findFirst({
        where: { id: actionPlanItemId, clientId, category: 'PRIVACY_SECURITY' }
      });
      if (!item) return { prepared: false, reason: 'request_missing' };
      const metadata = (item.metadata && typeof item.metadata === 'object' ? item.metadata : {}) as Record<string, any>;
      const requestedAt = String(metadata.requestedAt || '');
      if (metadata.preparedForRequestedAt === requestedAt && metadata.stage === 'CLIENT_ACTION_REQUIRED') {
        return { prepared: true, requestId: item.id, idempotent: true };
      }

      const agencyName = String(metadata.agencyName || 'reporting company');
      const command = String(metadata.command || '');
      const officialUrl = String(metadata.officialUrl || '');
      const isDispute = command === 'DISPUTE';
      const taskTitle = isDispute
        ? `Upload ${agencyName} report and supporting evidence`
        : `Complete ${agencyName} identity verification`;
      const taskDescription = isDispute
        ? `Upload the relevant report and factual supporting documents through the secure portal. CredX can prepare and track the dispute, but you review and authorize the final submission. Official resource: ${officialUrl}`
        : `Open the official agency portal and complete any required identity verification, credentials, CAPTCHA, and final authorization. CredX will keep the request tracked. Official resource: ${officialUrl}`;
      const preparedAt = new Date();
      const dedupeKey = `privacy-security:${item.id}:${requestedAt || item.updatedAt.toISOString()}`;
      const existingTask = await prisma.task.findFirst({
        where: { clientId, category: 'privacy_security', createdBy: `privacy-security:${item.id}`, completed: false }
      });

      await prisma.$transaction(async (tx) => {
        await tx.actionPlanItem.update({
          where: { id: item.id },
          data: {
            status: 'IN_PROGRESS',
            metadata: {
              ...metadata,
              stage: 'CLIENT_ACTION_REQUIRED',
              preparedAt: preparedAt.toISOString(),
              preparedForRequestedAt: requestedAt,
              clientActionRequired: true
            }
          }
        });
        if (existingTask) {
          await tx.task.update({
            where: { id: existingTask.id },
            data: { title: taskTitle, description: taskDescription, priority: isDispute ? 'high' : 'medium' }
          });
        } else {
          await tx.task.create({
            data: {
              clientId,
              title: taskTitle,
              description: taskDescription,
              category: 'privacy_security',
              priority: isDispute ? 'high' : 'medium',
              createdBy: `privacy-security:${item.id}`
            }
          });
        }
        await tx.notification.upsert({
          where: { clientId_dedupeKey: { clientId, dedupeKey } },
          create: {
            clientId,
            type: 'PRIVACY_SECURITY_CLIENT_ACTION',
            title: `${agencyName} request is ready for your action`,
            body: isDispute
              ? 'Upload the report and supporting evidence so the dispute can be prepared.'
              : 'Complete identity verification and final authorization on the official agency site.',
            href: '/portal',
            dedupeKey,
            metadata: { actionPlanItemId: item.id, agencyName, command }
          },
          update: {
            title: `${agencyName} request is ready for your action`,
            body: isDispute
              ? 'Upload the report and supporting evidence so the dispute can be prepared.'
              : 'Complete identity verification and final authorization on the official agency site.',
            readAt: null,
            metadata: { actionPlanItemId: item.id, agencyName, command }
          }
        });
        await tx.activityEvent.create({
          data: {
            clientId,
            type: 'PRIVACY_SECURITY_PREPARED',
            message: `${agencyName} request prepared; client action is required.`,
            metadata: { actionPlanItemId: item.id, command, preparedAt: preparedAt.toISOString() }
          }
        });
      });
      await writeAuditLog({
        action: 'PRIVACY_SECURITY_PREPARED',
        entityType: 'ActionPlanItem',
        entityId: item.id,
        metadata: { clientId, command }
      });
      return { prepared: true, requestId: item.id, stage: 'CLIENT_ACTION_REQUIRED' };
    }
  });
}
