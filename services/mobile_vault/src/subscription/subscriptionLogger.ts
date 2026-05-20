import logger from "../logger";

export const subscriptionLog = logger.child({ module: "subscription" });

export const webhookLog = subscriptionLog.child({ component: "revenuecat-webhook" });

export const syncLog = subscriptionLog.child({ component: "revenuecat-sync" });
