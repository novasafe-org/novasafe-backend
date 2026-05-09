import { Router } from "express";
import {
  getMembershipOverview,
  getSubscriptionDebugState,
  getSubscriptionOfferingsController,
  getSubscriptionState,
  handleRevenueCatWebhook,
  syncSubscriptionState,
} from "../controllers/mobileSubscriptionController";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.get("/state", authMiddleware, getSubscriptionState);
router.post("/sync", authMiddleware, syncSubscriptionState);
router.get("/offerings", authMiddleware, getSubscriptionOfferingsController);
router.get("/membership", authMiddleware, getMembershipOverview);
router.get("/debug", authMiddleware, getSubscriptionDebugState);
router.post("/webhook/revenuecat", handleRevenueCatWebhook);

export default router;
