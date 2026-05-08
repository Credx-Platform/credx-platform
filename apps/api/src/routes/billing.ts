import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const billingRouter = Router();

billingRouter.get('/plans', (_req, res) => {
  res.json({
    plans: [
      { code: 'MASTERCLASS', oneTime: 47, monthly: null, note: '+ applicable taxes & processing fees.' },
      { code: 'ESSENTIAL', setupFee: 150, monthly: 75 },
      { code: 'PREMIUM', oneTime: 447, monthly: null, guarantee: '90-day money-back guarantee' },
      { code: 'FAMILY', setupFee: 300, monthly: 95 }
    ]
  });
});

billingRouter.get('/admin/aging', requireAuth, requireRole(['STAFF', 'ADMIN']), (_req, res) => {
  res.json({ message: 'Billing retry automation scaffold pending Stripe webhook + scheduler integration.' });
});
