import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const billingRouter = Router();

billingRouter.get('/plans', (_req, res) => {
  res.json({
    plans: [
      { code: 'ESSENTIAL', setupFee: 150, monthly: 75 },
      { code: 'AGGRESSIVE', setupFee: 500, monthly: null, note: 'Compliance review required before launch copy.' },
      { code: 'FAMILY', setupFee: 300, monthly: 95 }
    ]
  });
});

billingRouter.get('/admin/aging', requireAuth, requireRole(['STAFF', 'ADMIN']), (_req, res) => {
  res.json({ message: 'Billing retry automation scaffold pending Stripe webhook + scheduler integration.' });
});
