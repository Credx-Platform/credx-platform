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
