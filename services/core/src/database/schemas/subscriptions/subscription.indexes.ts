import type { Model } from 'mongoose';
import type {
  IEntitlementRecord,
  IPurchaseHistory,
  ISubscriptionEvent,
  IUserSubscription,
} from './subscription.interface';

export const SUBSCRIPTION_INDEX_SPECS = {
  subscriptions: [{ key: { userId: 1 }, unique: true }],
  subscriptionEvents: [
    { key: { eventId: 1 }, unique: true },
    { key: { userId: 1, processedAt: -1 } },
    { key: { transactionId: 1 }, sparse: true },
  ],
  purchaseHistory: [
    { key: { userId: 1, createdAt: -1 } },
    { key: { transactionId: 1 }, unique: true, sparse: true },
  ],
  entitlements: [{ key: { userId: 1, entitlementId: 1 }, unique: true }],
} as const;

export const applySubscriptionIndexes = async (models: {
  subscription: Model<IUserSubscription>;
  subscriptionEvent: Model<ISubscriptionEvent>;
  purchaseHistory: Model<IPurchaseHistory>;
  entitlement?: Model<IEntitlementRecord>;
}): Promise<void> => {
  const tasks = [
    models.subscription.syncIndexes(),
    models.subscriptionEvent.syncIndexes(),
    models.purchaseHistory.syncIndexes(),
  ];
  if (models.entitlement) tasks.push(models.entitlement.syncIndexes());
  await Promise.all(tasks);
};
