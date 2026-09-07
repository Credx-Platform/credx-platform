import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { assessBusinessCreditFoundation } from '../lib/businessCredit.js';
import { requireEntitlement } from '../middleware/entitlement.js';

export const businessCreditRouter = Router();
businessCreditRouter.use(requireAuth, requireEntitlement('can_use_business_credit'));

async function clientIdFor(userId: string): Promise<string | null> {
  const c = await prisma.client.findUnique({ where: { userId }, select: { id: true } });
  return c?.id ?? null;
}

async function ensureProfile(clientId: string) {
  return prisma.businessCreditProfile.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    include: { vendorAccounts: { orderBy: { createdAt: 'asc' } }, tradelines: { orderBy: { createdAt: 'asc' } } }
  });
}

function serializeVendor(v: any) {
  return {
    id: v.id, vendorName: v.vendorName, accountType: v.accountType, status: v.status,
    reportsTo: v.reportsTo, creditLimit: v.creditLimit != null ? Number(v.creditLimit) : null,
    openedAt: v.openedAt, notes: v.notes
  };
}
function serializeTradeline(t: any) {
  return {
    id: t.id, creditorName: t.creditorName, accountType: t.accountType,
    balance: t.balance != null ? Number(t.balance) : null,
    creditLimit: t.creditLimit != null ? Number(t.creditLimit) : null,
    status: t.status, reportedTo: t.reportedTo, openedAt: t.openedAt
  };
}

function payload(profile: any) {
  const assessment = assessBusinessCreditFoundation(profile, profile.vendorAccounts ?? []);
  return {
    profile: {
      legalName: profile.legalName, entityType: profile.entityType, formationState: profile.formationState,
      einStatus: profile.einStatus, einLast4: profile.einLast4, dunsNumber: profile.dunsNumber,
      businessPhone: profile.businessPhone, businessEmail: profile.businessEmail,
      businessAddress: profile.businessAddress, businessDomain: profile.businessDomain,
      hasBankAccount: profile.hasBankAccount
    },
    vendorAccounts: (profile.vendorAccounts ?? []).map(serializeVendor),
    tradelines: (profile.tradelines ?? []).map(serializeTradeline),
    assessment
  };
}

businessCreditRouter.get('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });
    res.json(payload(await ensureProfile(clientId)));
  } catch (err) { next(err); }
});

const profileSchema = z.object({
  legalName: z.string().max(200).nullable().optional(),
  entityType: z.enum(['LLC', 'S_CORP', 'C_CORP', 'SOLE_PROP', 'PARTNERSHIP', 'NONPROFIT', 'OTHER']).nullable().optional(),
  formationState: z.string().max(40).nullable().optional(),
  einStatus: z.enum(['none', 'applied', 'issued']).optional(),
  einLast4: z.string().regex(/^\d{0,4}$/).nullable().optional(),
  dunsNumber: z.string().max(20).nullable().optional(),
  businessPhone: z.string().max(40).nullable().optional(),
  businessEmail: z.string().email().max(200).nullable().optional(),
  businessAddress: z.string().max(300).nullable().optional(),
  businessDomain: z.string().max(120).nullable().optional(),
  hasBankAccount: z.boolean().optional()
});

businessCreditRouter.put('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });
    const data = profileSchema.parse(req.body);

    await prisma.businessCreditProfile.upsert({
      where: { clientId },
      create: { clientId, ...data },
      update: data
    });
    res.json(payload(await ensureProfile(clientId)));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', details: err.issues });
    next(err);
  }
});

businessCreditRouter.patch('/checklist', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });
    const { key, done, note } = z.object({ key: z.string().min(1).max(60), done: z.boolean(), note: z.string().max(500).optional() }).parse(req.body);

    const existing = await ensureProfile(clientId);
    const list = Array.isArray(existing.checklist) ? [...(existing.checklist as any[])] : [];
    const idx = list.findIndex((c) => c && c.key === key);
    const merged = { key, done, ...(note !== undefined ? { note } : {}) };
    if (idx >= 0) list[idx] = { ...list[idx], ...merged }; else list.push(merged);

    await prisma.businessCreditProfile.update({
      where: { clientId },
      data: { checklist: list as unknown as Prisma.InputJsonValue }
    });
    res.json(payload(await ensureProfile(clientId)));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(err);
  }
});

// ---- vendor accounts ----
const vendorSchema = z.object({
  vendorName: z.string().min(1).max(120),
  accountType: z.enum(['net_30', 'net_60', 'revolving', 'fleet', 'store_card', 'other']).nullable().optional(),
  status: z.enum(['PROSPECT', 'APPLIED', 'OPEN', 'DECLINED', 'CLOSED']).optional(),
  reportsTo: z.array(z.enum(['dnb', 'experian_business', 'equifax_business'])).max(3).optional(),
  creditLimit: z.number().nonnegative().max(100_000_000).nullable().optional(),
  openedAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(500).nullable().optional()
});

async function ownedVendorOr404(clientId: string, id: string) {
  return prisma.businessVendorAccount.findFirst({ where: { id, profile: { clientId } } });
}

businessCreditRouter.post('/vendors', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });
    const data = vendorSchema.parse(req.body);
    const profile = await ensureProfile(clientId);
    await prisma.businessVendorAccount.create({
      data: {
        profileId: profile.id,
        vendorName: data.vendorName,
        accountType: data.accountType ?? null,
        status: data.status ?? 'PROSPECT',
        reportsTo: data.reportsTo ?? [],
        creditLimit: data.creditLimit ?? null,
        openedAt: data.openedAt ? new Date(data.openedAt) : null,
        notes: data.notes ?? null
      }
    });
    res.status(201).json(payload(await ensureProfile(clientId)));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', details: err.issues });
    next(err);
  }
});

businessCreditRouter.patch('/vendors/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });
    if (!(await ownedVendorOr404(clientId, String(req.params.id)))) return res.status(404).json({ error: 'Vendor account not found' });
    const data = vendorSchema.partial().parse(req.body);
    await prisma.businessVendorAccount.update({
      where: { id: String(req.params.id) },
      data: {
        ...(data.vendorName !== undefined ? { vendorName: data.vendorName } : {}),
        ...(data.accountType !== undefined ? { accountType: data.accountType } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.reportsTo !== undefined ? { reportsTo: data.reportsTo } : {}),
        ...(data.creditLimit !== undefined ? { creditLimit: data.creditLimit } : {}),
        ...(data.openedAt !== undefined ? { openedAt: data.openedAt ? new Date(data.openedAt) : null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {})
      }
    });
    res.json(payload(await ensureProfile(clientId)));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(err);
  }
});

businessCreditRouter.delete('/vendors/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });
    if (!(await ownedVendorOr404(clientId, String(req.params.id)))) return res.status(404).json({ error: 'Vendor account not found' });
    await prisma.businessVendorAccount.delete({ where: { id: String(req.params.id) } });
    res.json(payload(await ensureProfile(clientId)));
  } catch (err) { next(err); }
});

// ---- tradelines ----
const tradelineSchema = z.object({
  creditorName: z.string().min(1).max(120),
  accountType: z.string().max(60).nullable().optional(),
  balance: z.number().nonnegative().max(100_000_000).nullable().optional(),
  creditLimit: z.number().nonnegative().max(100_000_000).nullable().optional(),
  status: z.enum(['current', 'past_due', 'closed']).nullable().optional(),
  reportedTo: z.array(z.enum(['dnb', 'experian_business', 'equifax_business'])).max(3).optional(),
  openedAt: z.string().datetime().nullable().optional()
});

async function ownedTradelineOr404(clientId: string, id: string) {
  return prisma.businessTradeline.findFirst({ where: { id, profile: { clientId } } });
}

businessCreditRouter.post('/tradelines', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });
    const data = tradelineSchema.parse(req.body);
    const profile = await ensureProfile(clientId);
    await prisma.businessTradeline.create({
      data: {
        profileId: profile.id,
        creditorName: data.creditorName,
        accountType: data.accountType ?? null,
        balance: data.balance ?? null,
        creditLimit: data.creditLimit ?? null,
        status: data.status ?? null,
        reportedTo: data.reportedTo ?? [],
        openedAt: data.openedAt ? new Date(data.openedAt) : null
      }
    });
    res.status(201).json(payload(await ensureProfile(clientId)));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', details: err.issues });
    next(err);
  }
});

businessCreditRouter.patch('/tradelines/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });
    if (!(await ownedTradelineOr404(clientId, String(req.params.id)))) return res.status(404).json({ error: 'Tradeline not found' });
    const data = tradelineSchema.partial().parse(req.body);
    await prisma.businessTradeline.update({
      where: { id: String(req.params.id) },
      data: {
        ...(data.creditorName !== undefined ? { creditorName: data.creditorName } : {}),
        ...(data.accountType !== undefined ? { accountType: data.accountType } : {}),
        ...(data.balance !== undefined ? { balance: data.balance } : {}),
        ...(data.creditLimit !== undefined ? { creditLimit: data.creditLimit } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.reportedTo !== undefined ? { reportedTo: data.reportedTo } : {}),
        ...(data.openedAt !== undefined ? { openedAt: data.openedAt ? new Date(data.openedAt) : null } : {})
      }
    });
    res.json(payload(await ensureProfile(clientId)));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(err);
  }
});

businessCreditRouter.delete('/tradelines/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });
    if (!(await ownedTradelineOr404(clientId, String(req.params.id)))) return res.status(404).json({ error: 'Tradeline not found' });
    await prisma.businessTradeline.delete({ where: { id: String(req.params.id) } });
    res.json(payload(await ensureProfile(clientId)));
  } catch (err) { next(err); }
});
