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
}
