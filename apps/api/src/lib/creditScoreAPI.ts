import { prisma } from './prisma.js';

interface CreditScoreResponse {
  score: number;
  bureau?: string;
  timestamp: number;
}

const MYFREEESCORENOW_API_KEY = process.env.MYFREESCORENOW_API_KEY;
const MYFREEESCORENOW_BASE_URL = 'https://api.myfreescorenow.com';
const SCORE_PULL_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function callMyFreeScoreNowAPI(endpoint: string): Promise<CreditScoreResponse> {
  if (!MYFREEESCORENOW_API_KEY) {
    throw new Error('MYFREESCORENOW_API_KEY not configured');
  }

  const url = `${MYFREEESCORENOW_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${MYFREEESCORENOW_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`MyFreeScoreNow API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function pullCreditScore(clientId: string): Promise<{ score: number; isFirstPull: boolean }> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      creditScores: {
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  });

  if (!client) {
    throw new Error('Client not found');
  }

  const lastScore = client.creditScores[0];
  const now = new Date();

  if (lastScore && lastScore.lastPulledAt && (now.getTime() - lastScore.lastPulledAt.getTime()) < SCORE_PULL_COOLDOWN_MS) {
    return {
      score: lastScore.score,
      isFirstPull: false
    };
  }

  // Call MyFreeScoreNow API
  const apiResponse = await callMyFreeScoreNowAPI('/credit-score');

  // Store the new score
  const creditScore = await prisma.creditScore.create({
    data: {
      clientId,
      score: apiResponse.score,
      bureau: apiResponse.bureau || 'transunion',
      lastPulledAt: new Date()
    }
  });

  // Trigger email notification on score pull
  await triggerScoreNotificationEmail(client, apiResponse.score);

  return {
    score: creditScore.score,
    isFirstPull: !lastScore
  };
}

export async function getCreditScoreHistory(clientId: string, limit = 12): Promise<Array<{ score: number; pulledAt: Date }>> {
  const scores = await prisma.creditScore.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      score: true,
      pulledAt: true
    }
  });

  return scores.reverse();
}

async function triggerScoreNotificationEmail(client: { userId: string }, score: number) {
  // This would integrate with your email service
  console.log(`[SCORE_PULL] Client ${client.userId} pulled score: ${score}`);
}
