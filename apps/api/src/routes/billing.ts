import express, { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import Stripe from 'stripe';

export const billingRouter = Router();

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
      const payload = JSON.stringify(req.body);
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
