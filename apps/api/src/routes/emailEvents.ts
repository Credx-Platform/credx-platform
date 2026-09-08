import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export const emailEventsRouter = Router();

const sendgridEventSchema = z.object({
  email: z.string().email().optional(),
  event: z.string().optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
  sg_event_id: z.string().optional(),
  sg_message_id: z.string().optional(),
  reason: z.string().optional(),
  url: z.string().optional(),
  category: z.union([z.string(), z.array(z.string())]).optional()
}).passthrough();

const trackedEvents = new Set([
  'processed',
  'delivered',
  'open',
  'click',
  'bounce',
  'dropped',
  'deferred',
  'spamreport',
  'unsubscribe',
  'group_unsubscribe'
]);

function eventDate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value * 1000);
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return new Date(numeric * 1000);
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function eventMessage(event: string, email: string, payload: Record<string, unknown>) {
  const reason = typeof payload.reason === 'string' && payload.reason ? `: ${payload.reason}` : '';
  const url = typeof payload.url === 'string' && payload.url ? ` (${payload.url})` : '';
  switch (event) {
    case 'processed':
      return `Email accepted by SendGrid for ${email}.`;
    case 'delivered':
      return `Email delivered to ${email}.`;
    case 'open':
      return `Email opened by ${email}.`;
    case 'click':
      return `Email link clicked by ${email}${url}.`;
    case 'bounce':
      return `Email bounced for ${email}${reason}.`;
    case 'dropped':
      return `SendGrid dropped an email to ${email}${reason}.`;
    case 'deferred':
      return `Email delivery deferred for ${email}${reason}.`;
    case 'spamreport':
      return `Spam complaint reported for ${email}.`;
    case 'unsubscribe':
    case 'group_unsubscribe':
      return `Email unsubscribe recorded for ${email}.`;
    default:
      return `SendGrid email event for ${email}: ${event}.`;
  }
}

emailEventsRouter.post('/sendgrid', async (req, res, next) => {
  try {
    const configuredSecret = process.env.SENDGRID_EVENT_WEBHOOK_SECRET;
    const providedSecret = String(req.headers['x-credx-webhook-secret'] || req.query.secret || '');
    if (!configuredSecret || providedSecret !== configuredSecret) {
      return res.status(401).json({ error: 'Unauthorized webhook' });
    }

    const rawEvents = Array.isArray(req.body) ? req.body : [req.body];
    const parsedEvents = rawEvents
      .map((event) => sendgridEventSchema.safeParse(event))
      .filter((result): result is z.SafeParseSuccess<z.infer<typeof sendgridEventSchema>> => result.success)
      .map((result) => result.data);

    let recorded = 0;
    let skipped = 0;

    for (const event of parsedEvents) {
      const eventName = String(event.event || '').toLowerCase();
      const email = String(event.email || '').toLowerCase();
      if (!email || !trackedEvents.has(eventName)) {
        skipped += 1;
        continue;
      }

      const client = await prisma.client.findFirst({
        where: { user: { email } },
        select: { id: true }
      });

      if (!client) {
        skipped += 1;
        continue;
      }

      const eventId = event.sg_event_id || `${event.sg_message_id || email}:${eventName}:${event.timestamp || ''}:${event.url || ''}`;
      const existing = await prisma.activityEvent.findFirst({
        where: {
          clientId: client.id,
          type: `EMAIL_${eventName.toUpperCase()}`,
          metadata: {
            path: ['sendgridEventId'],
            equals: eventId
          }
        },
        select: { id: true }
      });

      if (existing) {
        skipped += 1;
        continue;
      }

      await prisma.activityEvent.create({
        data: {
          clientId: client.id,
          type: `EMAIL_${eventName.toUpperCase()}`,
          message: eventMessage(eventName, email, event),
          createdAt: eventDate(event.timestamp),
          metadata: {
            provider: 'sendgrid',
            sendgridEventId: eventId,
            sendgridMessageId: event.sg_message_id || null,
            event: eventName,
            email,
            url: event.url || null,
            reason: event.reason || null,
            category: event.category || null
          }
        }
      });
      recorded += 1;
    }

    return res.json({ ok: true, received: rawEvents.length, recorded, skipped });
  } catch (error) {
    next(error);
  }
});
