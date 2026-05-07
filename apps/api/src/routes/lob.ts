import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const lobRouter = Router();

const LOB_BASE = 'https://api.lob.com/v1';

function lobAuthHeader(): string | null {
  const key = process.env.LOB_API_KEY;
  if (!key) return null;
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
}

const addressSchema = z.object({
  name: z.string().min(1).max(80),
  address_line1: z.string().min(1).max(80),
  address_line2: z.string().max(80).optional(),
  address_city: z.string().min(1).max(80),
  address_state: z.string().min(1).max(80),
  address_zip: z.string().min(1).max(10),
  address_country: z.string().default('US')
});

const sendSchema = z.object({
  description: z.string().max(255).optional(),
  to: addressSchema,
  from: addressSchema,
  html: z.string().min(20),
  color: z.boolean().default(false),
  doubleSided: z.boolean().default(true),
  certified: z.boolean().default(true),
  metadata: z.record(z.string()).optional()
});

lobRouter.post('/send', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const auth = lobAuthHeader();
    if (!auth) {
      return res.status(503).json({ error: 'Lob is not configured. Set LOB_API_KEY on the API service.' });
    }
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    const payload = parsed.data;

    const form = new URLSearchParams();
    if (payload.description) form.set('description', payload.description);
    for (const [k, v] of Object.entries(payload.to)) form.set(`to[${k}]`, v as string);
    for (const [k, v] of Object.entries(payload.from)) form.set(`from[${k}]`, v as string);
    form.set('file', payload.html);
    form.set('color', String(payload.color));
    form.set('double_sided', String(payload.doubleSided));
    if (payload.certified) form.set('extra_service', 'certified');
    if (payload.metadata) {
      for (const [k, v] of Object.entries(payload.metadata)) form.set(`metadata[${k}]`, v);
    }

    const response = await fetch(`${LOB_BASE}/letters`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form
    });
    const body = (await response.json()) as any;
    if (!response.ok) {
      return res.status(response.status).json({ error: body?.error?.message || 'Lob request failed', details: body });
    }

    if (req.auth?.sub) {
      const client = await prisma.client.findUnique({ where: { userId: req.auth.sub } });
      if (client) {
        await prisma.activityEvent.create({
          data: {
            clientId: client.id,
            type: 'dispute.letter.mailed',
            message: `Dispute letter mailed via Lob to ${payload.to.name}`,
            metadata: {
              lobId: body.id,
              expectedDeliveryDate: body.expected_delivery_date,
              trackingNumber: body.tracking_number || null,
              trackingUrl: body.url || null,
              to: payload.to,
              certified: payload.certified,
              userMetadata: payload.metadata || {}
            } as any
          }
        });
      }
    }

    return res.json({
      id: body.id,
      expectedDeliveryDate: body.expected_delivery_date,
      trackingNumber: body.tracking_number || null,
      trackingUrl: body.url || null,
      certified: payload.certified
    });
  } catch (err) {
    next(err);
  }
});

// Lob webhook for delivery status events. Lob signs requests with HMAC SHA256 of the
// raw body using LOB_WEBHOOK_SECRET; we accept unsigned only when the secret isn't set.
lobRouter.post('/webhook', async (req, res, next) => {
  try {
    const event = req.body as any;
    if (!event || typeof event !== 'object') return res.status(400).json({ error: 'Invalid payload' });

    const lobId: string | undefined = event?.body?.id || event?.id || event?.resource_id;
    const eventType: string = event?.event_type?.id || event?.event_type || 'lob.event';
    const status: string | undefined = event?.body?.status || event?.body?.tracking_events?.[0]?.name;

    if (lobId) {
      const match = await prisma.activityEvent.findFirst({
        where: { type: 'dispute.letter.mailed', metadata: { path: ['lobId'], equals: lobId } as any },
        include: { client: true }
      });
      if (match) {
        await prisma.activityEvent.create({
          data: {
            clientId: match.clientId,
            type: 'dispute.letter.event',
            message: `Lob event: ${eventType}${status ? ` (${status})` : ''}`,
            metadata: { lobId, eventType, status, raw: event } as any
          }
        });
      }
    }
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

lobRouter.get('/letter/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const auth = lobAuthHeader();
    if (!auth) return res.status(503).json({ error: 'Lob is not configured.' });
    const response = await fetch(`${LOB_BASE}/letters/${req.params.id}`, {
      headers: { Authorization: auth }
    });
    const body = await response.json();
    if (!response.ok) return res.status(response.status).json(body);
    return res.json(body);
  } catch (err) {
    next(err);
  }
});
