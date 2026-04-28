import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sendEmail } from '../lib/email.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

export const disputesRouter = Router();

function getProgressDisputes(progress: any) {
  return Array.isArray(progress?.disputes) ? progress.disputes : [];
}

async function getClientWithProgress(userId: string) {
  return prisma.client.findUnique({
    where: { userId },
    include: { progress: true }
  });
}

// ============================================
// LEGACY ROUTES (keep for backward compatibility)
// ============================================

disputesRouter.get('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (req.auth?.role === 'CLIENT') {
      const client = await getClientWithProgress(req.auth.sub);
      if (!client) return res.status(404).json({ error: 'Client not found' });

      const progress = client.progress as any;
      return res.json({
        analysis: progress?.analysis ?? null,
        disputeStrategy: progress?.disputeStrategy ?? null,
        disputes: getProgressDisputes(progress),
        workflow: progress?.workflow ?? null
      });
    }

    if (!req.auth || !['STAFF', 'ADMIN'].includes(req.auth.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const disputes = await prisma.dispute.findMany({
      include: {
        client: {
          include: {
            user: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ disputes });
  } catch (error) {
    next(error);
  }
});

const disputeSchema = z.object({
  clientId: z.string().uuid(),
  creditorName: z.string().min(1),
  accountNumber: z.string().optional(),
  bureau: z.enum(['EXPERIAN', 'TRANSUNION', 'EQUIFAX']),
  round: z.number().int().min(1).default(1),
  reason: z.string().optional()
});

disputesRouter.post('/seed-case', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (req.auth?.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const presetId = String(req.body?.presetId || '').trim().toLowerCase();
    if (presetId !== 'galloway') {
      return res.status(400).json({ error: 'Unsupported preset' });
    }

    const client = await getClientWithProgress(req.auth.sub);
    if (!client || !client.progress) return res.status(404).json({ error: 'Client not found' });

    const now = new Date().toISOString();
    const disputes = [
      { id: crypto.randomUUID(), title: 'Capital One dispute', bureau: 'Experian', status: 'drafted', priority: 'high', type: 'bureau_packet', createdAt: now },
      { id: crypto.randomUUID(), title: 'Midland Credit validation', bureau: 'Experian / TransUnion', status: 'drafted', priority: 'high', type: 'collector_validation', createdAt: now },
      { id: crypto.randomUUID(), title: 'Personal information cleanup', bureau: 'All 3 Bureaus', status: 'drafted', priority: 'high', type: 'bureau_packet', createdAt: now }
    ];
    const analysis = {
      caseId: 'galloway',
      clientName: 'Sharon Galloway',
      findings: [
        'Very high utilization is suppressing scores.',
        'Negative reporting is heavier on Experian and TransUnion.',
        'Several tradelines appear to need factual verification.'
      ]
    };
    const disputeStrategy = {
      objective: 'Start with factual inconsistencies and documentation-backed disputes.',
      phases: ['Personal information cleanup', 'Round-one bureau disputes', 'Collector validation where needed']
    };
    const progress = client.progress as any;

    await prisma.clientProgress.update({
      where: { clientId: client.id },
      data: {
        analysis,
        disputeStrategy,
        disputes,
        workflow: {
          ...(progress.workflow || {}),
          stage: 'round_one_disputes_ready',
          updatedAt: now,
          next: ['mail_round_one_packets', 'wait_for_responses', 'review_for_cfpb_or_mov']
        }
      }
    });

    return res.json({ analysis, disputeStrategy, disputes, workflow: { stage: 'round_one_disputes_ready', updatedAt: now } });
  } catch (error) {
    next(error);
  }
});

disputesRouter.post('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (req.auth?.role === 'CLIENT') {
      const client = await getClientWithProgress(req.auth.sub);
      if (!client || !client.progress) return res.status(404).json({ error: 'Client not found' });

      const createdAt = new Date().toISOString();
      const dispute = {
        id: crypto.randomUUID(),
        title: `${String(req.body?.accountName || 'Manual dispute').trim()} dispute`,
        bureau: String(req.body?.bureau || 'All 3 Bureaus'),
        status: 'drafted',
        priority: 'medium',
        type: 'manual',
        accountName: String(req.body?.accountName || '').trim(),
        accountNumber: String(req.body?.accountNumber || '').trim(),
        reason: String(req.body?.reason || 'Inaccurate reporting').trim(),
        request: String(req.body?.request || 'Reinvestigate and correct or delete if inaccurate.').trim(),
        notes: String(req.body?.notes || '').trim(),
        createdAt
      };

      const progress = client.progress as any;
      const disputes = [...getProgressDisputes(progress), dispute];
      await prisma.clientProgress.update({
        where: { clientId: client.id },
        data: {
          disputes,
          workflow: {
            ...(progress.workflow || {}),
            stage: 'round_one_disputes_ready',
            updatedAt: createdAt,
            next: ['mail_round_one_packets', 'wait_for_responses', 'review_for_cfpb_or_mov']
          }
        }
      });

      return res.status(201).json(dispute);
    }

    if (!req.auth || !['STAFF', 'ADMIN'].includes(req.auth.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const data = disputeSchema.parse(req.body);
    const dispute = await prisma.dispute.create({ data });
    return res.status(201).json({ dispute });
  } catch (error) {
    next(error);
  }
});

// ============================================
// NEW CDM ROUTES (Dispute Manager MVP)
// ============================================

// ---------- Furnishers ----------

disputesRouter.get('/furnishers', requireAuth, requireRole(['STAFF', 'ADMIN']), async (_req, res, next) => {
  try {
    const furnishers = await prisma.furnisher.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });
    return res.json({ furnishers });
  } catch (error) {
    next(error);
  }
});

const furnisherSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['CREDITOR', 'COLLECTOR', 'BUREAU']).default('CREDITOR'),
  address: z.string().optional()
});

disputesRouter.post('/furnishers', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const data = furnisherSchema.parse(req.body);
    const furnisher = await prisma.furnisher.create({ data });
    return res.status(201).json({ furnisher });
  } catch (error) {
    next(error);
  }
});

// ---------- Dispute Items (CDM Core) ----------

const disputeItemSchema = z.object({
  clientId: z.string().uuid(),
  furnisher: z.string().min(1),
  accountNumber: z.string().optional(),
  accountType: z.enum(['LATE_PAYMENT', 'COLLECTION', 'CHARGE_OFF', 'INQUIRY', 'OTHER']).default('OTHER'),
  balance: z.number().optional(),
  dateAdded: z.string().datetime().optional(),
  disputeEquifax: z.boolean().default(false),
  disputeExperian: z.boolean().default(false),
  disputeTransunion: z.boolean().default(false),
  reason: z.string().min(1),
  customInstruction: z.string().optional()
});

// Get all dispute items for a client
disputesRouter.get('/items', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const { clientId } = req.query;
    const where = clientId ? { clientId: String(clientId) } : {};
    
    const items = await prisma.disputeItem.findMany({
      where,
      include: {
        client: {
          include: { user: true }
        },
        rounds: {
          orderBy: { roundNumber: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    return res.json({ items });
  } catch (error) {
    next(error);
  }
});

// Create new dispute item
disputesRouter.post('/items', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const data = disputeItemSchema.parse(req.body);
    
    // Calculate due date (30 days from now for tracking)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    
    const item = await prisma.disputeItem.create({
      data: {
        ...data,
        dueDate
      },
      include: {
        client: {
          include: { user: true }
        }
      }
    });
    
    // Create activity event
    await prisma.activityEvent.create({
      data: {
        clientId: data.clientId,
        type: 'DISPUTE_ITEM_CREATED',
        message: `New dispute item added: ${data.furnisher}`,
        metadata: { furnisher: data.furnisher, accountNumber: data.accountNumber }
      }
    });
    
    return res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

// Update dispute item
disputesRouter.put('/items/:id', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const data = disputeItemSchema.partial().parse(req.body);
    
    const item = await prisma.disputeItem.update({
      where: { id },
      data,
      include: {
        client: {
          include: { user: true }
        },
        rounds: true
      }
    });
    
    return res.json({ item });
  } catch (error) {
    next(error);
  }
});

// Delete dispute item
disputesRouter.delete('/items/:id', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    await prisma.disputeItem.delete({ where: { id } });
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ---------- Dispute Rounds ----------

const roundSchema = z.object({
  disputeItemId: z.string().uuid(),
  roundNumber: z.number().int().min(1),
  sentDate: z.string().datetime(),
  dueDate: z.string().datetime(),
  notes: z.string().optional(),
  equifaxStatus: z.enum(['PENDING', 'SENT', 'RESPONSE_RECEIVED']).optional(),
  experianStatus: z.enum(['PENDING', 'SENT', 'RESPONSE_RECEIVED']).optional(),
  transunionStatus: z.enum(['PENDING', 'SENT', 'RESPONSE_RECEIVED']).optional()
});

// Create new round for a dispute item
disputesRouter.post('/rounds', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const data = roundSchema.parse(req.body);
    
    const round = await prisma.disputeRound.create({ data });
    
    // Update the dispute item's current round
    await prisma.disputeItem.update({
      where: { id: data.disputeItemId },
      data: { 
        currentRound: data.roundNumber,
        status: 'IN_DISPUTE'
      }
    });
    
    return res.status(201).json({ round });
  } catch (error) {
    next(error);
  }
});

// Update round status
disputesRouter.put('/rounds/:id', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const data = roundSchema.partial().parse(req.body);
    
    const round = await prisma.disputeRound.update({
      where: { id },
      data
    });
    
    return res.json({ round });
  } catch (error) {
    next(error);
  }
});

// Get rounds for a dispute item
disputesRouter.get('/items/:id/rounds', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const rounds = await prisma.disputeRound.findMany({
      where: { disputeItemId: id },
      orderBy: { roundNumber: 'desc' }
    });
    return res.json({ rounds });
  } catch (error) {
    next(error);
  }
});

// ---------- CSV Import ----------

import multer from 'multer';
import csv from 'csv-parser';
import { Readable } from 'stream';

const upload = multer({ storage: multer.memoryStorage() });

disputesRouter.post('/import/csv', requireAuth, requireRole(['STAFF', 'ADMIN']), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { clientId } = req.body;
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }

    const results: any[] = [];
    const stream = Readable.from(req.file.buffer.toString());
    
    stream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          const createdItems = [];
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);

          for (const row of results) {
            const item = await prisma.disputeItem.create({
              data: {
                clientId,
                furnisher: row.furnisher || row.creditor || row.name || 'Unknown',
                accountNumber: row.accountNumber || row.account,
                accountType: (row.accountType || 'OTHER').toUpperCase(),
                balance: row.balance ? parseFloat(row.balance) : null,
                disputeEquifax: row.equifax === 'true' || row.equifax === 'yes',
                disputeExperian: row.experian === 'true' || row.experian === 'yes',
                disputeTransunion: row.transunion === 'true' || row.transunion === 'yes',
                reason: row.reason || 'Account inaccurately reported',
                customInstruction: row.instructions || null,
                dueDate
              }
            });
            createdItems.push(item);
          }

          await prisma.activityEvent.create({
            data: {
              clientId,
              type: 'CSV_IMPORT',
              message: `Imported ${createdItems.length} dispute items from CSV`,
              metadata: { count: createdItems.length }
            }
          });

          return res.json({ 
            success: true, 
            count: createdItems.length,
            items: createdItems 
          });
        } catch (error) {
          next(error);
        }
      });
  } catch (error) {
    next(error);
  }
});

// ---------- Bulk Actions ----------

// Update status for multiple items
disputesRouter.post('/bulk/update-status', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const { ids, status } = z.object({
      ids: z.array(z.string().uuid()),
      status: z.enum(['PENDING', 'IN_DISPUTE', 'DELETED', 'UPDATED', 'VERIFIED'])
    }).parse(req.body);

    const result = await prisma.disputeItem.updateMany({
      where: { id: { in: ids } },
      data: { status }
    });

    return res.json({ updated: result.count });
  } catch (error) {
    next(error);
  }
});

// Delete multiple items
disputesRouter.post('/bulk/delete', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const { ids } = z.object({
      ids: z.array(z.string().uuid())
    }).parse(req.body);

    const result = await prisma.disputeItem.deleteMany({
      where: { id: { in: ids } }
    });

    return res.json({ deleted: result.count });
  } catch (error) {
    next(error);
  }
});

// ---------- Dispute Initiation ----------

const initiateSchema = z.object({
  itemId: z.string().uuid(),
  clientId: z.string().uuid(),
  bureaus: z.object({
    equifax: z.boolean().default(false),
    experian: z.boolean().default(false),
    transunion: z.boolean().default(false)
  })
});

// Initiate a dispute for an item
disputesRouter.post('/initiate', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const { itemId, clientId, bureaus } = initiateSchema.parse(req.body);
    
    // Get the dispute item
    const item = await prisma.disputeItem.findUnique({
      where: { id: itemId },
      include: { rounds: true }
    });
    
    if (!item) {
      return res.status(404).json({ error: 'Dispute item not found' });
    }
    
    // Calculate next round number
    const nextRound = item.currentRound + 1;
    
    // Calculate due date (35 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 35);
    
    // Create dispute round
    const round = await prisma.disputeRound.create({
      data: {
        disputeItemId: itemId,
        roundNumber: nextRound,
        sentDate: new Date(),
        dueDate,
        equifaxStatus: bureaus.equifax ? 'SENT' : 'PENDING',
        experianStatus: bureaus.experian ? 'SENT' : 'PENDING',
        transunionStatus: bureaus.transunion ? 'SENT' : 'PENDING',
        notes: `Round ${nextRound} initiated via admin portal`
      }
    });
    
    // Update dispute item status
    const updatedItem = await prisma.disputeItem.update({
      where: { id: itemId },
      data: {
        status: 'IN_DISPUTE',
        currentRound: nextRound
      },
      include: {
        client: {
          include: { user: true }
        },
        rounds: {
          orderBy: { roundNumber: 'desc' }
        }
      }
    });
    
    // Create activity event
    await prisma.activityEvent.create({
      data: {
        clientId,
        type: 'DISPUTE_INITIATED',
        message: `Dispute initiated for ${item.furnisher} (Round ${nextRound})`,
        metadata: {
          furnisher: item.furnisher,
          round: nextRound,
          bureaus: Object.keys(bureaus).filter(k => bureaus[k as keyof typeof bureaus])
        }
      }
    });
    
    return res.status(201).json({
      success: true,
      item: updatedItem,
      round
    });
  } catch (error) {
    next(error);
  }
});

// ---------- Bureau Status Updates ----------

const bureauStatusSchema = z.object({
  status: z.enum(['PENDING', 'DELETED', 'UPDATED', 'VERIFIED']),
  bureau: z.enum(['efx', 'xpn', 'tu']).optional()
});

const bulkIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1)
});

const scoreUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  scores: z.object({
    equifax: z.number().int().min(300).max(850).nullable().optional(),
    experian: z.number().int().min(300).max(850).nullable().optional(),
    transunion: z.number().int().min(300).max(850).nullable().optional()
  })
});

function formatItemType(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/(^|\s)\S/g, (s) => s.toUpperCase());
}

function formatResultStatus(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/(^|\s)\S/g, (s) => s.toUpperCase());
}

disputesRouter.post('/bulk/email-results', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const { ids } = bulkIdsSchema.parse(req.body);

    const items = await prisma.disputeItem.findMany({
      where: { id: { in: ids } },
      include: {
        client: {
          include: { user: true }
        }
      }
    });

    const grouped = new Map<string, typeof items>();
    for (const item of items) {
      const key = item.clientId;
      const existing = grouped.get(key) || [];
      existing.push(item);
      grouped.set(key, existing);
    }

    const deliveries: Array<{ clientId: string; email: string; result: Awaited<ReturnType<typeof sendEmail>> }> = [];

    for (const [clientId, clientItems] of grouped.entries()) {
      const client = clientItems[0]?.client;
      if (!client?.user?.email) continue;

      const deletedCount = clientItems.filter((item) => item.status === 'DELETED').length;
      const updatedCount = clientItems.filter((item) => item.status === 'UPDATED').length;
      const verifiedCount = clientItems.filter((item) => item.status === 'VERIFIED').length;
      const inDisputeCount = clientItems.filter((item) => item.status === 'IN_DISPUTE').length;

      const rows = clientItems.map((item) => `<li><strong>${item.furnisher}</strong> ${item.accountNumber ? `(${item.accountNumber})` : ''} — ${formatItemType(item.accountType)} — ${formatResultStatus(item.status)}</li>`).join('');
      const subject = 'Your CredX dispute results update';
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.6;">
          <h2 style="margin-bottom:12px;">Your dispute results update</h2>
          <p>Hi ${client.user.firstName || 'there'},</p>
          <p>Here is your latest results summary from CredX.</p>
          <ul>
            <li><strong>Deleted:</strong> ${deletedCount}</li>
            <li><strong>Updated:</strong> ${updatedCount}</li>
            <li><strong>Verified:</strong> ${verifiedCount}</li>
            <li><strong>Still in dispute:</strong> ${inDisputeCount}</li>
          </ul>
          <p><strong>Accounts included in this update:</strong></p>
          <ul>${rows}</ul>
          <p>Sign in to your CredX portal for the latest activity and next-step notes.</p>
        </div>
      `;
      const text = `Your CredX dispute results update\n\nHi ${client.user.firstName || 'there'},\n\nDeleted: ${deletedCount}\nUpdated: ${updatedCount}\nVerified: ${verifiedCount}\nStill in dispute: ${inDisputeCount}\n\nAccounts included:\n${clientItems.map((item) => `- ${item.furnisher}${item.accountNumber ? ` (${item.accountNumber})` : ''} — ${formatItemType(item.accountType)} — ${formatResultStatus(item.status)}`).join('\n')}\n\nSign in to your CredX portal for the latest activity and next-step notes.`;

      const result = await sendEmail({ to: client.user.email, subject, html, text });
      deliveries.push({ clientId, email: client.user.email, result });

      await prisma.activityEvent.create({
        data: {
          clientId,
          type: 'RESULTS_EMAIL_SENT',
          message: `Dispute results email sent to ${client.user.email}`,
          metadata: { itemIds: clientItems.map((item) => item.id), statuses: clientItems.map((item) => item.status) }
        }
      });
    }

    return res.json({ success: true, deliveries });
  } catch (error) {
    next(error);
  }
});

disputesRouter.post('/bulk/update-scores', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const { ids, scores } = scoreUpdateSchema.parse(req.body);

    const items = await prisma.disputeItem.findMany({
      where: { id: { in: ids } },
      include: {
        client: {
          include: { user: true, progress: true }
        }
      }
    });

    if (!items.length) {
      return res.status(404).json({ error: 'No dispute items found' });
    }

    const clientIds = [...new Set(items.map((item) => item.clientId))];
    if (clientIds.length !== 1) {
      return res.status(400).json({ error: 'Score updates must be sent for one client at a time.' });
    }

    const client = items[0].client;
    const existingScores = (client.progress?.scores as any) || { equifax: null, experian: null, transunion: null };
    const mergedScores = { ...existingScores, ...scores };

    if (client.progress) {
      await prisma.clientProgress.update({
        where: { clientId: client.id },
        data: { scores: mergedScores }
      });
    } else {
      await prisma.clientProgress.create({
        data: {
          clientId: client.id,
          scores: mergedScores
        }
      });
    }

    await prisma.activityEvent.create({
      data: {
        clientId: client.id,
        type: 'SCORES_UPDATED',
        message: 'Credit score update sent to client',
        metadata: { scores: mergedScores, itemIds: ids }
      }
    });

    const subject = 'Your CredX score update';
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.6;">
        <h2 style="margin-bottom:12px;">Your latest score update</h2>
        <p>Hi ${client.user.firstName || 'there'},</p>
        <p>CredX has updated the latest score snapshot on your file.</p>
        <ul>
          <li><strong>Equifax:</strong> ${mergedScores.equifax ?? 'Not provided'}</li>
          <li><strong>Experian:</strong> ${mergedScores.experian ?? 'Not provided'}</li>
          <li><strong>TransUnion:</strong> ${mergedScores.transunion ?? 'Not provided'}</li>
        </ul>
        <p>Sign in to your portal to review dispute progress, account changes, and next steps.</p>
      </div>
    `;
    const text = `Your CredX score update\n\nHi ${client.user.firstName || 'there'},\n\nCredX has updated the latest score snapshot on your file.\n\nEquifax: ${mergedScores.equifax ?? 'Not provided'}\nExperian: ${mergedScores.experian ?? 'Not provided'}\nTransUnion: ${mergedScores.transunion ?? 'Not provided'}\n\nSign in to your portal to review dispute progress, account changes, and next steps.`;

    const delivery = await sendEmail({ to: client.user.email, subject, html, text });

    return res.json({ success: true, clientId: client.id, email: client.user.email, scores: mergedScores, delivery });
  } catch (error) {
    next(error);
  }
});

// Update dispute item with bureau-specific status
disputesRouter.put('/items/:id/status', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const { status, bureau } = bureauStatusSchema.parse(req.body);
    
    // Get current item
    const item = await prisma.disputeItem.findUnique({
      where: { id },
      include: { rounds: { orderBy: { roundNumber: 'desc' }, take: 1 } }
    });
    
    if (!item) {
      return res.status(404).json({ error: 'Dispute item not found' });
    }
    
    const updateData: any = { status };
    
    // If bureau specified, update bureau-specific status on latest round
    if (bureau && item.rounds.length > 0) {
      const latestRound = item.rounds[0];
      const bureauField = bureau === 'efx' ? 'equifaxStatus' : 
                         bureau === 'xpn' ? 'experianStatus' : 'transunionStatus';
      
      await prisma.disputeRound.update({
        where: { id: latestRound.id },
        data: { [bureauField]: status === 'DELETED' ? 'RESPONSE_RECEIVED' : status }
      });
      
      // Also update the main item status based on bureau results
      if (status === 'DELETED') {
        updateData.status = 'DELETED';
      } else if (status === 'UPDATED') {
        updateData.status = 'UPDATED';
      } else if (status === 'VERIFIED') {
        updateData.status = 'VERIFIED';
      }
    }
    
    const updatedItem = await prisma.disputeItem.update({
      where: { id },
      data: updateData,
      include: {
        client: {
          include: { user: true }
        },
        rounds: {
          orderBy: { roundNumber: 'desc' }
        }
      }
    });
    
    // Create activity event
    await prisma.activityEvent.create({
      data: {
        clientId: item.clientId,
        type: 'DISPUTE_STATUS_UPDATED',
        message: `Dispute status updated to ${status}${bureau ? ` (${bureau.toUpperCase()})` : ''}`,
        metadata: {
          furnisher: item.furnisher,
          status,
          bureau: bureau || null
        }
      }
    });
    
    return res.json({ item: updatedItem });
  } catch (error) {
    next(error);
  }
});
