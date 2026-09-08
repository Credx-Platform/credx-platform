import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { pullCreditScore, getCreditScoreHistory, CreditReportImportUnavailableError } from '../lib/creditScoreAPI.js';
import { prisma } from '../lib/prisma.js';

export const creditScoreRouter = Router();

// Pull/update credit score for current user
creditScoreRouter.post('/pull', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (!req.auth?.sub) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const client = await prisma.client.findUnique({
      where: { userId: req.auth.sub }
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const result = await pullCreditScore(client.id);

    return res.status(200).json({
      score: result.score,
      isFirstPull: result.isFirstPull,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    if (error instanceof CreditReportImportUnavailableError) {
      return res.status(503).json({ error: error.message, code: error.code });
    }
    next(error);
  }
});

// Get credit score history
creditScoreRouter.get('/history', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (!req.auth?.sub) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const client = await prisma.client.findUnique({
      where: { userId: req.auth.sub }
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const limit = parseInt(req.query.limit as string) || 12;
    const history = await getCreditScoreHistory(client.id, Math.min(limit, 24));

    return res.status(200).json({
      history,
      count: history.length
    });
  } catch (error) {
    next(error);
  }
});

// Get latest credit score
creditScoreRouter.get('/latest', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (!req.auth?.sub) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const client = await prisma.client.findUnique({
      where: { userId: req.auth.sub },
      include: {
        creditScores: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const latestScore = client.creditScores[0];

    return res.status(200).json({
      score: latestScore?.score || null,
      pulledAt: latestScore?.pulledAt || null,
      hasScore: !!latestScore
    });
  } catch (error) {
    next(error);
  }
});
