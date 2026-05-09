import { Request, Response } from "express";
import {
  getSubscriptionDebugSnapshot,
  getSubscriptionOfferings,
  getSubscriptionStateForUser,
  processRevenueCatWebhook,
  syncPurchaseForUser,
} from "../services/subscriptionService";

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
  const auth = req.headers.authorization;
  const result = await processRevenueCatWebhook(req.body || {}, auth);
  res.status(result.status).json({ success: result.status === 200, message: result.message });
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
