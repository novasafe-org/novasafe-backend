import type { NextFunction, Request, Response } from 'express';
import { assertEntitlement } from '../../subscriptions';
import type { EntitlementKey } from '../../subscriptions/config/subscription.config';

export const requireEntitlement =
  (entitlement: EntitlementKey) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    const result = await assertEntitlement(userId, entitlement);
    if (!result.ok && 'message' in result) {
      res.status(403).json({
        success: false,
        code: 'NOVASAFE_SUBSCRIPTION_REQUIRED',
        message: result.message,
        entitlement,
        subscription: result.state,
      });
      return;
    }
    next();
  };
