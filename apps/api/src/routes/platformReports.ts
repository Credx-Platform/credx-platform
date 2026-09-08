import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { enqueueJob } from '../lib/jobs.js';
import { REPORT_TITLES } from '../lib/platformReports.js';

export const platformReportsRouter = Router();

async function clientIdFor(userId: string): Promise<string | null> {
  const c = await prisma.client.findUnique({ where: { userId }, select: { id: true } });
  return c?.id ?? null;
}

function meta(r: any) {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    status: r.status,
    format: r.format,
    dataSources: r.dataSources,
    disclosure: r.disclosure,
    error: r.error,
    requestedAt: r.requestedAt,
    generatedAt: r.generatedAt
  };
}

/** POST /api/reports { kind } — request a report; generated async via the queue. */
platformReportsRouter.post('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });
    const { kind } = z.object({ kind: z.enum(['READINESS_REPORT', 'CREDIT_PROFILE_SUMMARY']) }).parse(req.body);

    // Reuse a very recent identical request rather than piling up jobs.
    const recent = await prisma.platformReport.findFirst({
      where: { clientId, kind, status: { in: ['PENDING', 'GENERATING'] } },
      orderBy: { createdAt: 'desc' }
    });
    if (recent) return res.status(202).json({ report: meta(recent), reused: true });

    const report = await prisma.platformReport.create({
      data: { clientId, kind, title: REPORT_TITLES[kind], disclosure: '', status: 'PENDING' }
    });
    const queued = await enqueueJob('reports', 'generate-platform-report', { reportId: report.id });

    res.status(202).json({ report: meta(report), queue: queued.status });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid report kind' });
    next(err);
  }
});

/** GET /api/reports — the caller's reports (metadata only). */
platformReportsRouter.get('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.json({ reports: [] });
    const rows = await prisma.platformReport.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 30
    });
    res.json({ reports: rows.map(meta), kinds: REPORT_TITLES });
  } catch (err) {
    next(err);
  }
});

/** GET /api/reports/:id — full report incl. html + data (owned + READY). */
platformReportsRouter.get('/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });
    const report = await prisma.platformReport.findFirst({ where: { id: String(req.params.id), clientId } });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json({ ...meta(report), html: report.status === 'READY' ? report.html : null, data: report.data });
  } catch (err) {
    next(err);
  }
});

/** GET /api/reports/:id/view — serve the report HTML for opening / printing. */
platformReportsRouter.get('/:id/view', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).send('Not found');
    const report = await prisma.platformReport.findFirst({ where: { id: String(req.params.id), clientId } });
    if (!report || report.status !== 'READY' || !report.html) return res.status(404).send('Report not ready');
    res.set('content-type', 'text/html; charset=utf-8');
    res.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    res.send(report.html);
  } catch (err) {
    next(err);
  }
});
