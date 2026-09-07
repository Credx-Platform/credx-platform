import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'credx-api', timestamp: new Date().toISOString() });
});

healthRouter.get('/db', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', service: 'credx-api', dependency: 'database' });
  } catch {
    res.status(503).json({ status: 'error', service: 'credx-api', dependency: 'database' });
  }
});

// SaaS Upgrade: queue liveness + backlog visibility. Never 5xx — a queue
// problem should be observable without failing load-balancer health checks.
healthRouter.get('/queue', async (_req, res) => {
  try {
    const [{ getQueueStats }, { getInProcessRunner }] = await Promise.all([
      import('../lib/queue.js'),
      import('../lib/queueRunner.js')
    ]);
    const stats = await getQueueStats();
    const workers = await prisma.workerHeartbeat.findMany({
      orderBy: { lastBeat: 'desc' },
      take: 10
    });
    const now = Date.now();
    res.json({
      status: 'ok',
      inProcessRunner: Boolean(getInProcessRunner()?.isRunning()),
      mode: String(process.env.QUEUE_MODE || 'db'),
      stats,
      workers: workers.map((w) => ({
        workerId: w.workerId,
        queueName: w.queueName,
        lastBeatSecondsAgo: Math.round((now - w.lastBeat.getTime()) / 1000),
        jobsProcessed: w.jobsProcessed,
        jobsFailed: w.jobsFailed
      }))
    });
  } catch (err) {
    res.json({
      status: 'degraded',
      error: err instanceof Error ? err.message : String(err)
    });
  }
});
