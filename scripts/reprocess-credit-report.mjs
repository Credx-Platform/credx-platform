#!/usr/bin/env node

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { extractReport } from '../apps/api/dist/lib/reportExtractor.js';
import { CreditAnalysisService } from '../apps/api/dist/lib/creditAnalysis.js';
import { dispatchAnalysisEmail } from '../apps/api/dist/lib/analysisEmailDispatch.js';
import { syncReportDerivedClientData } from '../apps/api/dist/lib/clientReportSync.js';

const prisma = new PrismaClient();

function usage() {
  console.error('Usage: node scripts/reprocess-credit-report.mjs --client-id <id> [--email]');
}

function parseArgs(argv) {
  const args = { email: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client-id') args.clientId = argv[++i];
    else if (argv[i] === '--email') args.email = true;
  }
  return args;
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/s);
  if (!match) return null;
  return {
    mimeType: match[1] || 'application/octet-stream',
    buffer: Buffer.from(match[2], 'base64')
  };
}

async function replaceCreditReports(clientId, extracted, uploadedAt) {
  const existingReports = await prisma.creditReport.findMany({
    where: { clientId },
    select: { id: true }
  });

  if (existingReports.length) {
    const ids = existingReports.map((report) => report.id);
    await prisma.tradeline.deleteMany({ where: { creditReportId: { in: ids } } });
    await prisma.creditReport.deleteMany({ where: { id: { in: ids } } });
  }

  const scoreByBureau = new Map();
  for (const snap of extracted.richPayload?.scores || []) {
    if (snap?.bureau) scoreByBureau.set(snap.bureau, snap.score ?? null);
  }

  for (const bureauReport of extracted.bureauReports) {
    const pulledAt = bureauReport.pulledAt ? new Date(bureauReport.pulledAt) : uploadedAt;
    await prisma.creditReport.create({
      data: {
        clientId,
        bureau: bureauReport.bureau,
        source: extracted.source,
        pulledAt: Number.isFinite(pulledAt.getTime()) ? pulledAt : uploadedAt,
        score: scoreByBureau.get(bureauReport.bureau) ?? null,
        rawPayload: { rich: extracted.richPayload, raw: extracted.rawPayload },
        tradelines: {
          create: bureauReport.tradelines.map((tradeline) => ({
            creditorName: tradeline.creditorName,
            accountNumber: tradeline.accountNumber,
            accountType: tradeline.accountType,
            status: tradeline.status,
            balance: tradeline.balance,
            isNegative: tradeline.isNegative
          }))
        }
      }
    });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.clientId) {
    usage();
    process.exit(1);
  }

  const client = await prisma.client.findUnique({
    where: { id: args.clientId },
    include: {
      user: true,
      progress: true,
      documents: {
        where: { type: 'CREDIT_REPORT' },
        orderBy: { uploadedAt: 'desc' },
        take: 1
      }
    }
  });

  if (!client) throw new Error(`Client not found: ${args.clientId}`);
  const document = client.documents[0];
  if (!document?.content) throw new Error('No inline credit-report content found for the latest upload.');

  const decoded = decodeDataUrl(document.content);
  if (!decoded) throw new Error('Latest credit report is not stored as a base64 data URL.');

  const extracted = await extractReport({
    buffer: decoded.buffer,
    mimeType: document.contentType || decoded.mimeType,
    filename: document.fileName || 'credit-report.pdf'
  });

  if (!extracted || extracted.bureauReports.length === 0) {
    throw new Error('Report extraction returned no bureau reports. Check AI gateway credits/model access and try again.');
  }

  await replaceCreditReports(client.id, extracted, document.uploadedAt || new Date());

  const clientWithReports = await prisma.client.findUnique({
    where: { id: client.id },
    include: {
      user: true,
      creditReports: { orderBy: { pulledAt: 'desc' }, include: { tradelines: true } }
    }
  });

  const analysis = CreditAnalysisService.generate({
    client: clientWithReports,
    creditReports: clientWithReports.creditReports
  });

  const nowIso = new Date().toISOString();
  const syncResult = await syncReportDerivedClientData(prisma, {
    client: {
      ...clientWithReports,
      progress: client.progress
    },
    analysis,
    workflow: {
      ...((client.progress?.workflow || {})),
      stage: 'analysis_ready',
      updatedAt: nowIso,
      next: ['review_analysis', 'begin_disputes']
    }
  });

  await prisma.client.update({
    where: { id: client.id },
    data: {
      status: 'ANALYSIS_READY',
      analysisSummary: `${analysis.clientFacingSummary.slice(0, 500)}...`
    }
  });

  await prisma.activityEvent.create({
    data: {
      clientId: client.id,
      type: 'ANALYSIS_REPROCESSED',
      message: `Credit analysis reprocessed from uploaded report: ${analysis.keyFindings.length} findings identified.`,
      metadata: {
        findingCount: analysis.keyFindings.length,
        disputeCount: analysis.disputeOpportunities.length,
        bureauReports: extracted.bureauReports.length
      }
    }
  });

  let emailResult = { sent: false, reason: 'email not requested' };
  if (args.email) {
    emailResult = await dispatchAnalysisEmail({
      clientId: client.id,
      analysis,
      trigger: 'admin_generate',
      force: true
    });
  }

  console.log(JSON.stringify({
    success: true,
    clientId: client.id,
    bureauReports: extracted.bureauReports.length,
    tradelines: extracted.bureauReports.reduce((sum, report) => sum + report.tradelines.length, 0),
    findings: analysis.keyFindings.length,
    disputes: analysis.disputeOpportunities.length,
    scores: syncResult.scores,
    emailed: emailResult.sent,
    emailSkippedReason: emailResult.sent ? undefined : emailResult.reason
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
