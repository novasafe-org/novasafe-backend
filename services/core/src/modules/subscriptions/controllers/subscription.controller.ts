import { Request, Response } from "express";
import {
  getMembershipOverviewForUser,
  getPurchaseHistoryForUser,
  getSubscriptionDebugSnapshot,
  getSubscriptionOfferings,
  getSubscriptionStateForUser,
  syncPurchaseForUser,
} from "../services/subscription.service";
import { processRevenueCatWebhook } from "../revenuecat/revenueCatWebhookProcessor";
import { webhookLog } from "../revenuecat/subscriptionLogger";
import { isWebhookSecretConfigured } from "../revenuecat/revenueCatWebhookAuth";

export const getSubscriptionState = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const forceRefresh = String(req.query.forceRefresh || "false") === "true";
  const state = await getSubscriptionStateForUser(userId, { forceRefresh });
  res.status(200).json({ success: true, source: req.source, data: state });
};

export const syncSubscriptionState = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const state = await syncPurchaseForUser(userId);
  res.status(200).json({ success: true, source: req.source, data: state });
};

export const getSubscriptionOfferingsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const offerings = await getSubscriptionOfferings();
  res.status(200).json({ success: true, source: req.source, data: offerings });
};

export const handleRevenueCatWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!isWebhookSecretConfigured()) {
    webhookLog.error("REVENUECAT_WEBHOOK_SECRET is not set — webhook cannot be verified");
    res.status(503).json({
      success: false,
      message: "Webhook secret not configured (set REVENUECAT_WEBHOOK_SECRET)",
    });
    return;
  }

  try {
    const auth = req.headers.authorization;
    const result = await processRevenueCatWebhook(req.body ?? {}, auth);
    res.status(result.status).json({
      success: result.status >= 200 && result.status < 300,
      message: result.message,
      eventId: result.eventId,
      eventType: result.eventType,
      duplicate: result.duplicate ?? false,
    });
  } catch (error: unknown) {
    webhookLog.error(
      { err: error instanceof Error ? error.message : String(error) },
      'Unhandled webhook error',
    );
    res.status(500).json({ success: false, message: "Internal webhook error" });
  }
};

export const getMembershipOverview = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const data = await getMembershipOverviewForUser(userId);
  res.status(200).json({ success: true, source: req.source, data });
};

export const getSubscriptionPurchases = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const purchases = await getPurchaseHistoryForUser(userId, 25);
  res.status(200).json({ success: true, source: req.source, data: { purchases } });
};

export const getSubscriptionDebugState = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const qaKey = process.env.SUBSCRIPTION_DEBUG_KEY || "";
  if (qaKey) {
    const provided = String(req.headers["x-debug-key"] || req.query.debugKey || "");
    if (!provided || provided !== qaKey) {
      res.status(403).json({ success: false, message: "Invalid debug key" });
      return;
    }
  }
  const data = await getSubscriptionDebugSnapshot(userId);
  res.status(200).json({ success: true, source: req.source, data });
};
