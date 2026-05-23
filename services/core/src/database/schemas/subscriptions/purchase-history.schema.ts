import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { userIdField } from '../common/user-reference.schema';
import type { IPurchaseHistory } from './subscription.interface';

const purchaseHistoryDefinition = {
  ...userIdField,
  eventId: { type: String, required: true },
  eventType: { type: String, required: true },
  productId: { type: String, default: null },
  transactionId: { type: String, default: null },
  store: { type: String, default: null },
  environment: { type: String, default: null },
  purchasedAt: { type: Date, default: null },
};

export const PurchaseHistorySchema = createBaseSchema(purchaseHistoryDefinition);

PurchaseHistorySchema.index({ userId: 1, createdAt: -1 });
PurchaseHistorySchema.index({ transactionId: 1 }, { unique: true, sparse: true });

export const PURCHASE_HISTORY_MODEL_NAME = 'PurchaseHistory';
export const PURCHASE_HISTORY_COLLECTION = COLLECTIONS.purchaseHistory;

export type { IPurchaseHistory };
