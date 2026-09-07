import { prisma } from './prisma.js';
import { calculateReadinessScore } from './readinessScore.js';

export async function generateAllReadinessSnapshots() {
  const clients = await prisma.client.findMany({
    where: { status: { in: ['ACTIVE', 'ANALYSIS_READY', 'UPGRADE_OFFERED', 'INTAKE_RECEIVED'] } },
    include: { progress: true, tasks: true, creditReports: { include: { tradelines: true } } }
  });
  const results = [];
  for (const client of clients) {
    try {
      const readiness = calculateReadinessScore(client);
      const snapshot = await prisma.readinessScoreSnapshot.create({
        data: {
          clientId: client.id,
          score: readiness.score,
          label: readiness.label,
          dataQuality: readiness.dataQuality,
          categories: readiness.categories,
          strengths: readiness.strengths,
          opportunities: readiness.opportunities,
          nextBestActions: readiness.nextBestActions,
          nextBestActionDetails: readiness.nextBestActionDetails,
          generatedAt: readiness.generatedAt
        }
      });
      results.push({ clientId: client.id, score: readiness.score, snapshotId: snapshot.id });
    } catch (err) {
      console.error('Failed snapshot for', client.id, err);
    }
  }
  return results;
}

export async function generateClientReadinessSnapshot(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { progress: true, tasks: true, creditReports: { include: { tradelines: true } } }
  });
  if (!client) throw new Error('Client not found');
  const readiness = calculateReadinessScore(client);
  return prisma.readinessScoreSnapshot.create({
    data: {
      clientId: client.id,
      score: readiness.score,
      label: readiness.label,
      dataQuality: readiness.dataQuality,
      categories: readiness.categories,
      strengths: readiness.strengths,
      opportunities: readiness.opportunities,
      nextBestActions: readiness.nextBestActions,
      nextBestActionDetails: readiness.nextBestActionDetails,
      generatedAt: readiness.generatedAt
    }
  });
}
