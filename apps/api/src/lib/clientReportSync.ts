import type { PrismaClient } from '@prisma/client';
import { deriveReportSubject } from './creditAnalysis.js';

type BureauScores = {
  experian: number | null;
  equifax: number | null;
  transunion: number | null;
};

type SyncClient = {
  id: string;
  userId: string;
  currentAddressLine1?: string | null;
  currentCity?: string | null;
  currentState?: string | null;
  currentPostalCode?: string | null;
  user?: {
    id?: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  progress?: {
    workflow?: unknown;
  } | null;
  creditReports?: Array<{
    rawPayload?: unknown;
  }>;
};

function scoresFromAnalysis(analysis: any): BureauScores {
  const scores: BureauScores = { experian: null, equifax: null, transunion: null };
  for (const score of analysis?.bureauScores || []) {
    if (typeof score?.score !== 'number') continue;
    if (score.bureau === 'EXPERIAN') scores.experian = score.score;
    if (score.bureau === 'EQUIFAX') scores.equifax = score.score;
    if (score.bureau === 'TRANSUNION') scores.transunion = score.score;
  }
  return scores;
}

function personalProfileFromReports(client: SyncClient): any | null {
  for (const report of client.creditReports || []) {
    const profile = (report.rawPayload as any)?.rich?.personalProfile;
    if (profile?.experian || profile?.equifax || profile?.transunion) return profile;
  }
  return null;
}

export async function syncReportDerivedClientData(
  prisma: PrismaClient,
  params: {
    client: SyncClient;
    analysis: any;
    workflow?: unknown;
  }
) {
  const { client, analysis, workflow } = params;
  const scores = scoresFromAnalysis(analysis);
  const personalProfile = analysis?.personalProfile || personalProfileFromReports(client);

  if (personalProfile) {
    const subject = deriveReportSubject(personalProfile);
    const clientUpdate: Record<string, string> = {};
    if (!client.currentAddressLine1 && subject.addressLine1) clientUpdate.currentAddressLine1 = subject.addressLine1;
    if (!client.currentCity && subject.city) clientUpdate.currentCity = subject.city;
    if (!client.currentState && subject.state) clientUpdate.currentState = subject.state;
    if (!client.currentPostalCode && subject.postalCode) clientUpdate.currentPostalCode = subject.postalCode;
    if (Object.keys(clientUpdate).length) {
      await prisma.client.update({ where: { id: client.id }, data: clientUpdate });
    }

    const userUpdate: Record<string, string> = {};
    if (!client.user?.firstName?.trim() && subject.firstName) userUpdate.firstName = subject.firstName;
    if (!client.user?.lastName?.trim() && subject.lastName) userUpdate.lastName = subject.lastName;
    if (Object.keys(userUpdate).length) {
      await prisma.user.update({ where: { id: client.userId }, data: userUpdate });
    }
  }

  const updateData: Record<string, unknown> = {
    analysis,
    scores
  };
  if (workflow) updateData.workflow = workflow;

  await prisma.clientProgress.upsert({
    where: { clientId: client.id },
    update: updateData,
    create: {
      clientId: client.id,
      analysis,
      scores,
      ...(workflow ? { workflow } : {})
    }
  });

  return { scores };
}
