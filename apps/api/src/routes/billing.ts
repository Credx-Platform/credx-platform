import express, { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import Stripe from 'stripe';
import {
  paypalEnabled,
  paypalPublicConfig,
  createPaypalOrder,
  capturePaypalOrder,
  getPaypalOrder,
  verifyPaypalWebhookSignature
} from '../lib/paypal.js';

export const billingRouter = Router();

// PayPal carries the EDUCATION product only. Credit repair services require
// PayPal pre-approval under their Acceptable Use Policy — dispute-plan fees
// stay on the high-risk processor path (/confirm below).
const MASTERCLASS_PRICE_USD = 47;
const MASTERCLASS_CUSTOM_ID = 'masterclass';
const MASTERCLASS_OFFERS = {
  'friends-family': { key: 'friends-family', label: 'Friends & family', discountPercent: 100 },
  'social-media': { key: 'social-media', label: 'Social media', discountPercent: 66 }
} as const;

type MasterclassOffer = (typeof MASTERCLASS_OFFERS)[keyof typeof MASTERCLASS_OFFERS];

function normalizeOfferKey(key: unknown) {
  return String(key || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function getMasterclassOffer(key: unknown): MasterclassOffer | null {
  const normalized = normalizeOfferKey(key);
  return (MASTERCLASS_OFFERS as Record<string, MasterclassOffer>)[normalized] || null;
}

function masterclassPriceForOffer(offer: MasterclassOffer | null) {
  if (!offer) return MASTERCLASS_PRICE_USD;
  const discount = MASTERCLASS_PRICE_USD * (offer.discountPercent / 100);
  return Math.max(0, Number((MASTERCLASS_PRICE_USD - discount).toFixed(2)));
}

billingRouter.get('/plans', (_req, res) => {
  res.json({
    plans: [
      { code: 'MASTERCLASS', oneTime: 47, monthly: null, note: '+ applicable taxes & processing fees.' },
      { code: 'ESSENTIAL', setupFee: 150, monthly: 75 },
      { code: 'PREMIUM', oneTime: 447, monthly: null, billing: 'Billed after first full dispute round is delivered. No guaranteed outcome.' },
      { code: 'FAMILY', setupFee: 300, monthly: 95 }
    ]
  });
});

// ============================================================
// PayPal — education (masterclass) checkout only
// ============================================================

billingRouter.get('/paypal/config', (_req, res) => {
  res.json(paypalPublicConfig());
});

const paypalOrderSchema = z.object({
  product: z.literal('MASTERCLASS'),
  offerKey: z.string().max(40).optional()
});

billingRouter.post('/paypal/order', async (req, res, next) => {
  try {
    if (!paypalEnabled()) return res.status(503).json({ error: 'Online checkout is not available yet.' });
    const data = paypalOrderSchema.parse(req.body);
    const offer = getMasterclassOffer(data.offerKey);
    const amount = masterclassPriceForOffer(offer);
    if (amount <= 0) {
      return res.status(400).json({ error: 'This offer does not require PayPal checkout.' });
    }

    const order = await createPaypalOrder({
      amount,
      currency: 'USD',
      description: offer
        ? `CredX 5-Day Credit Education Masterclass (${offer.label} offer)`
        : 'CredX 5-Day Credit Education Masterclass (digital course)',
      customId: MASTERCLASS_CUSTOM_ID,
      invoiceId: `MC-${offer ? 'OFFER-' : ''}${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    });

    return res.json({ orderId: order.id });
  } catch (error) {
    next(error);
  }
});

const paypalCaptureSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email()
});

async function recordMasterclassPayment(input: {
  clientId: string;
  amount: number;
  currency: string;
  captureId: string;
  status: 'PAID' | 'PENDING';
  provider?: string;
}) {
  const provider = input.provider || 'paypal';
  const existing = await prisma.payment.findFirst({
    where: { provider, providerRef: input.captureId }
  });
  if (existing) {
    if (existing.status === 'PENDING' && input.status === 'PAID') {
      return prisma.payment.update({
        where: { id: existing.id },
        data: { status: 'PAID', paidAt: new Date() }
      });
    }
    return existing;
  }
  return prisma.payment.create({
    data: {
      clientId: input.clientId,
      amount: input.amount,
      currency: input.currency,
      type: 'MASTERCLASS',
      status: input.status,
      provider,
      providerRef: input.captureId,
      ...(input.status === 'PAID' ? { paidAt: new Date() } : {})
    }
  });
}

const freePromoEnrollSchema = paypalCaptureSchema.extend({
  product: z.literal('MASTERCLASS'),
  offerKey: z.string().min(1).max(40)
});

billingRouter.post('/masterclass/promo-enroll', async (req, res, next) => {
  try {
    const data = freePromoEnrollSchema.parse(req.body);
    const offer = getMasterclassOffer(data.offerKey);
    if (!offer || offer.discountPercent !== 100) {
      return res.status(400).json({ error: 'This offer is not valid for free masterclass access.' });
    }

    const { enrollMasterclassStudent } = await import('../lib/masterclassEnrollment.js');
    const enrollment = await enrollMasterclassStudent({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      source: `masterclass-offer-${offer.key}`
    });

    await recordMasterclassPayment({
      clientId: enrollment.clientId,
      amount: 0,
      currency: 'USD',
      captureId: `offer:${offer.key}:${enrollment.clientId}:${Date.now()}`,
      status: 'PAID',
      provider: 'offer'
    });

    await prisma.activityEvent.create({
      data: {
        clientId: enrollment.clientId,
        type: 'PAYMENT_RECEIVED',
        message: `Masterclass access granted with ${offer.label} offer (${offer.discountPercent}% off).`,
        metadata: { amount: 0, currency: 'USD', method: 'offer', offerKey: offer.key }
      }
    });

    return res.status(201).json({ success: true, enrolled: true, emailSent: enrollment.emailSent });
  } catch (error) {
    next(error);
  }
});

function extractCapture(orderResult: any): { id: string; status: string; amount: number; currency: string } | null {
  const capture = orderResult?.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture?.id) return null;
  return {
    id: capture.id,
    status: capture.status,
    amount: Number(capture.amount?.value ?? 0),
    currency: capture.amount?.currency_code || 'USD'
  };
}

billingRouter.post('/paypal/order/:orderId/capture', async (req, res, next) => {
  try {
    if (!paypalEnabled()) return res.status(503).json({ error: 'Online checkout is not available yet.' });
    const buyer = paypalCaptureSchema.parse(req.body);
    const orderId = String(req.params.orderId || '');
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const result = await capturePaypalOrder(orderId);
    const capture = extractCapture(result);
    if (!capture) {
      return res.status(402).json({ error: 'Payment was not completed. You have not been charged.' });
    }

    // PENDING captures (e.g. eChecks) enroll once the PAYMENT.CAPTURE.COMPLETED
    // webhook arrives — don't grant access before the money clears.
    if (capture.status !== 'COMPLETED') {
      console.log(`PayPal capture ${capture.id} is ${capture.status}; deferring enrollment to webhook.`);
      return res.json({ success: true, pending: true, message: 'Payment is processing. Your access email will arrive once it clears.' });
    }

    const { enrollMasterclassStudent } = await import('../lib/masterclassEnrollment.js');
    const enrollment = await enrollMasterclassStudent({
      firstName: buyer.firstName,
      lastName: buyer.lastName,
      email: buyer.email,
      source: 'masterclass-paypal'
    });

    await recordMasterclassPayment({
      clientId: enrollment.clientId,
      amount: capture.amount,
      currency: capture.currency,
      captureId: capture.id,
      status: 'PAID'
    });

    await prisma.activityEvent.create({
      data: {
        clientId: enrollment.clientId,
        type: 'PAYMENT_RECEIVED',
        message: `Masterclass payment of $${capture.amount} ${capture.currency} received (PayPal).`,
        metadata: { amount: capture.amount, currency: capture.currency, method: 'paypal', reference: capture.id }
      }
    });

    return res.json({ success: true, enrolled: true, emailSent: enrollment.emailSent });
  } catch (error) {
    next(error);
  }
});

// PayPal webhook — backstop for captures that complete asynchronously (eChecks)
// or where the browser died before our capture endpoint recorded the sale.
billingRouter.post('/paypal/webhook', async (req, res) => {
  try {
    if (!paypalEnabled()) return res.status(503).json({ error: 'PayPal not configured' });

    const rawBody: string = (req as any).rawBody
      ? (req as any).rawBody.toString('utf8')
      : JSON.stringify(req.body);
    const verified = await verifyPaypalWebhookSignature(req.headers, rawBody);
    if (!verified) return res.status(400).json({ error: 'Webhook signature verification failed' });

    const event = req.body;
    if (event?.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
      return res.json({ received: true });
    }

    const capture = event.resource;
    if (capture?.custom_id !== MASTERCLASS_CUSTOM_ID) {
      // Only education payments run through PayPal by design; log anything else.
      console.warn(`PayPal capture ${capture?.id} has unexpected custom_id ${capture?.custom_id}; not auto-processed.`);
      return res.json({ received: true, processed: false });
    }

    const captureId = String(capture.id || '');
    const alreadyRecorded = captureId
      ? await prisma.payment.findFirst({ where: { provider: 'paypal', providerRef: captureId, status: 'PAID' } })
      : null;
    if (alreadyRecorded) return res.json({ received: true, processed: true, duplicate: true });

    // Pull the order to get the payer identity for enrollment.
    const orderId = capture?.supplementary_data?.related_ids?.order_id;
    if (!orderId) {
      console.error(`PayPal webhook: capture ${captureId} completed but no related order id; manual review needed.`);
      return res.json({ received: true, processed: false, reason: 'No order id on capture' });
    }

    const order = await getPaypalOrder(orderId);
    const payerEmail = order?.payer?.email_address;
    if (!payerEmail) {
      console.error(`PayPal webhook: order ${orderId} has no payer email; manual review needed.`);
      return res.json({ received: true, processed: false, reason: 'No payer email' });
    }

    const { enrollMasterclassStudent } = await import('../lib/masterclassEnrollment.js');
    const enrollment = await enrollMasterclassStudent({
      firstName: order?.payer?.name?.given_name || 'Student',
      lastName: order?.payer?.name?.surname || '',
      email: payerEmail,
      source: 'masterclass-paypal-webhook'
    });

    await recordMasterclassPayment({
      clientId: enrollment.clientId,
      amount: Number(capture?.amount?.value ?? MASTERCLASS_PRICE_USD),
      currency: capture?.amount?.currency_code || 'USD',
      captureId,
      status: 'PAID'
    });

    return res.json({ received: true, processed: true });
  } catch (err: any) {
    console.error('PayPal webhook processing failed:', err?.message);
    return res.status(500).json({ received: true, error: err?.message });
  }
});

// Online payment confirmation — processor-agnostic (Authorize.Net / PaymentCloud).
// Your processor's webhook (or a relay) POSTs here once a payment clears, and this
// triggers the SAME settle-and-activate path as the manual "Mark Paid" button.
// Secured with a shared secret (BILLING_CONFIRM_SECRET) sent as x-billing-secret
// or in the body. The caller must include the clientId (e.g. mapped from the
// Authorize.Net invoice/refId you set at checkout).
billingRouter.post('/confirm', async (req, res, next) => {
  try {
    const secret = process.env.BILLING_CONFIRM_SECRET || '';
    const provided = (req.headers['x-billing-secret'] as string | undefined) || req.body?.secret;
    if (!secret || provided !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const clientId = String(req.body?.clientId || '');
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    const amount = typeof req.body?.amount === 'number' ? req.body.amount : undefined;
    const currency = typeof req.body?.currency === 'string' ? req.body.currency : undefined;
    const reference = typeof req.body?.reference === 'string' ? req.body.reference : undefined;

    // Settle ONLY — payment never triggers dispute work (counsel, 2026-07-07).
    // The processor already captured the money, so an early payment is recorded
    // and flagged for review/refund rather than rejected.
    const { settleSetupPayment } = await import('../lib/billingActivation.js');
    const result = await settleSetupPayment(clientId, {
      amount, currency, reference, method: 'online', recordDespiteGate: true
    });

    return res.json({ success: true, settled: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Client not found') return res.status(404).json({ error: message });
    next(error);
  }
});

billingRouter.get('/admin/aging', requireAuth, requireRole(['STAFF', 'ADMIN']), (_req, res) => {
  res.json({ message: 'Billing retry automation scaffold pending Stripe webhook + scheduler integration.' });
});

billingRouter.get('/webhook', (_req, res) => {
  const configured = Boolean(process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_SECRET_KEY);
  res.json({
    status: 'ok',
    endpoint: '/api/billing/webhook',
    method: 'POST',
    configured,
    events: ['payment_intent.succeeded', 'invoice.payment_succeeded', 'checkout.session.completed'],
    description: 'Stripe webhook endpoint. Send Stripe events here to auto-activate clients and generate dispute letters after payment.'
  });
});

// ============================================================
// Stripe Webhook — Payment completion triggers activation + letter generation
// ============================================================

billingRouter.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string | undefined;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
  
  let event: any;
  
  try {
    if (stripeSecretKey && stripeWebhookSecret && sig) {
      // Verify signature with Stripe SDK
      const stripe = new Stripe(stripeSecretKey, { apiVersion: '2026-05-27.dahlia' as any });
      // Stripe signs the raw request bytes — re-serializing the parsed body
      // breaks verification, so use the rawBody stashed by express.json's verify hook.
      const payload = (req as any).rawBody ?? JSON.stringify(req.body);
      try {
        event = stripe.webhooks.constructEvent(payload, sig, stripeWebhookSecret);
      } catch (verifyErr: any) {
        console.error('Webhook signature verification failed:', verifyErr.message);
        return res.status(400).send(`Webhook signature verification failed: ${verifyErr.message}`);
      }
    } else {
      // No Stripe credentials configured — parse body directly (testing mode)
      event = req.body;
    }
  } catch (err: any) {
    console.error('Webhook parse failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle payment completion events
  if (event.type === 'payment_intent.succeeded' || event.type === 'invoice.payment_succeeded' || event.type === 'checkout.session.completed') {
    const paymentIntent = event.data?.object;
    const clientId = paymentIntent?.metadata?.clientId || paymentIntent?.client_reference_id;
    
    if (!clientId) {
      console.log('Payment webhook: no clientId in metadata, skipping auto-activation');
      return res.json({ received: true, activated: false, reason: 'No clientId in payment metadata' });
    }

    try {
      // Settle ONLY — payment never triggers dispute work (counsel, 2026-07-07).
      // Stripe already captured the money, so an early payment is recorded and
      // flagged for review/refund rather than rejected.
      const { settleSetupPayment } = await import('../lib/billingActivation.js');
      const result = await settleSetupPayment(clientId, {
        amount: (paymentIntent.amount_received || paymentIntent.amount || 0) / 100,
        currency: (paymentIntent.currency || 'usd').toUpperCase(),
        stripePaymentIntentId: paymentIntent.id || undefined,
        reference: paymentIntent.id || undefined,
        method: 'stripe',
        recordDespiteGate: true
      });

      return res.json({ received: true, settled: true, gateWarnings: result.gateWarnings, clientId });
    } catch (err: any) {
      if (err?.message === 'Client not found') {
        return res.json({ received: true, settled: false, reason: 'Client not found' });
      }
      console.error('Payment settlement failed:', err);
      return res.status(500).json({ received: true, settled: false, error: err.message });
    }
  }

  res.json({ received: true });
});
