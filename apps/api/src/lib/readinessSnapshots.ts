import { prisma } from './prisma.js';
import { calculateReadinessScore } from './readinessScore.js';
import { notifyReadinessChanged, notifyNewRecommendedAction } from './notifications.js';

async function createSnapshotWithNotifications(client: any) {
  const readiness = calculateReadinessScore(client);

  const prev = await prisma.readinessScoreSnapshot.findFirst({
    where: { clientId: client.id },
    orderBy: { createdAt: 'desc' },
    select: { score: true, nextBestActionDetails: true }
  });

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

  // Producer: readiness score changed by a meaningful amount.
  notifyReadinessChanged(client.id, prev?.score ?? null, readiness.score);

  // Producer: a new high-priority recommended action appeared.
  const prevIds = new Set(
    (Array.isArray(prev?.nextBestActionDetails) ? (prev!.nextBestActionDetails as any[]) : []).map((a) => a?.id)
  );
  const newHigh = readiness.nextBestActionDetails.find((a) => a.priority === 'high' && !prevIds.has(a.id));
  if (prev && newHigh) {
    notifyNewRecommendedAction(client.id, { id: newHigh.id, title: newHigh.title, href: newHigh.href });
  }

  return { snapshot, readiness };
}

export async function generateAllReadinessSnapshots() {
  const clients = await prisma.client.findMany({
    where: { status: { in: ['ACTIVE', 'ANALYSIS_READY', 'UPGRADE_OFFERED', 'INTAKE_RECEIVED'] } },
    include: { progress: true, tasks: true, creditReports: { include: { tradelines: true } } }
  });
  const results = [];
  for (const client of clients) {
    try {
      const { snapshot, readiness } = await createSnapshotWithNotifications(client);
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
  const { snapshot } = await createSnapshotWithNotifications(client);
  return snapshot;
}
