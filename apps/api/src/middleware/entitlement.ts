import type { NextFunction, Response } from 'express';
import type { AuthedRequest } from './auth.js';
import { prisma } from '../lib/prisma.js';
import { resolveClientEntitlements, type EntitlementKey } from '../lib/entitlements.js';
import { getCurrentSubscription, toSubscriptionPlanInput } from '../lib/subscriptions.js';

/** Apply after requireAuth. Paid feature access is enforced server-side. */
export function requireEntitlement(key: EntitlementKey) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.auth) return res.status(401).json({ error: 'Authentication required' });
      const client = await prisma.client.findUnique({
        where: { userId: req.auth.sub }, include: { progress: true }
      });
      if (!client) return res.status(404).json({ error: 'Client profile not found' });
      const education = client.progress?.education as Record<string, unknown> | null;
      const subscription = await getCurrentSubscription(client.id);
      const resolved = resolveClientEntitlements({
        status: client.status, serviceTier: client.serviceTier,
        masterclassAccess: education?.masterclassAccess === true,
        subscription: toSubscriptionPlanInput(subscription)
      });
      if (!resolved.entitlements[key]) {
        return res.status(403).json({ error: 'Your plan does not include this feature', code: 'ENTITLEMENT_REQUIRED', entitlement: key });
      }
      next();
    } catch (error) { next(error); }
  };
}
