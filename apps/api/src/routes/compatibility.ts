import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  compatibilityFields,
  normalizeClientForCompatibility,
  normalizeLeadForCompatibility,
  toCsv
} from '../lib/saasCompatibility.js';

export const compatibilityRouter = Router();

compatibilityRouter.get('/fields', requireAuth, requireRole(['STAFF', 'ADMIN']), (_req, res) => {
  return res.json({
    sourceSystem: 'credx',
    version: '2026-07-07',
    fields: compatibilityFields
  });
});

compatibilityRouter.get('/lead-client-records', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const [clients, leads] = await Promise.all([
      prisma.client.findMany({
        include: {
          user: true,
          payments: true,
          disputes: true,
          documents: true,
          progress: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.lead.findMany({ orderBy: { createdAt: 'desc' } })
    ]);

    const clientKeys = new Set(clients.map((client) => client.user.email.toLowerCase()));
    const records = [
      ...clients.map(normalizeClientForCompatibility),
      ...leads
        .filter((lead) => !clientKeys.has(lead.email.toLowerCase()))
        .map(normalizeLeadForCompatibility)
    ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

    if (req.query.format === 'csv') {
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', 'attachment; filename="credx-lead-client-records.csv"');
      return res.send(`${toCsv(records)}\n`);
    }

    return res.json({
      sourceSystem: 'credx',
      count: records.length,
      fields: compatibilityFields,
      records
    });
  } catch (error) {
    next(error);
  }
});

