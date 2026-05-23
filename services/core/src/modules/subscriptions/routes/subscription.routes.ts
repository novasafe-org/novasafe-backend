import { Router } from 'express';
import { authMiddleware } from '../../auth';
import {
  getMembershipOverview,
  getSubscriptionDebugState,
  getSubscriptionOfferingsController,
  getSubscriptionState,
  handleRevenueCatWebhook,
  syncSubscriptionState,
} from '../controllers/subscription.controller';

export const createSubscriptionRoutes = (): Router => {
  const router = Router();

  router.get('/state', authMiddleware, getSubscriptionState);
  router.post('/sync', authMiddleware, syncSubscriptionState);
  router.get('/offerings', authMiddleware, getSubscriptionOfferingsController);
  router.get('/membership', authMiddleware, getMembershipOverview);
  router.get('/debug', authMiddleware, getSubscriptionDebugState);
  router.post('/webhook/revenuecat', handleRevenueCatWebhook);

  return router;
};
