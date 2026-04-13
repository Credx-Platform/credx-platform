import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const disputesRouter = Router();

// ============================================
// LEGACY ROUTES (keep for backward compatibility)
// ============================================

disputesRouter.get('/', requireAuth, requireRole(['STAFF', 'ADMIN']), async (_req, res, next) => {
  try {
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

disputesRouter.post('/', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
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
