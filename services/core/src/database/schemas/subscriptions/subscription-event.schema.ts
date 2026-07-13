import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { mixedType } from '../common/schema-types';
import { optionalUserIdField } from '../common/user-reference.schema';
import { WebhookEventStatus } from './subscription.enums';
import type { ISubscriptionEvent } from './subscription.interface';

const subscriptionEventDefinition = {
  eventId: { type: String, required: true, unique: true },
  eventType: { type: String, required: true },
  ...optionalUserIdField,
  transactionId: { type: String, default: null },
  status: { type: String, enum: Object.values(WebhookEventStatus), default: WebhookEventStatus.Processing },
  payload: { type: mixedType, default: {} },
  errorMessage: { type: String, default: null },
  processedAt: { type: Date, default: Date.now },
};

export const SubscriptionEventSchema = createBaseSchema(subscriptionEventDefinition);

SubscriptionEventSchema.index({ userId: 1, processedAt: -1 });
SubscriptionEventSchema.index({ transactionId: 1 }, { sparse: true });

export const SUBSCRIPTION_EVENT_MODEL_NAME = 'SubscriptionEvent';
export const SUBSCRIPTION_EVENT_COLLECTION = COLLECTIONS.subscriptionEvents;

export type { ISubscriptionEvent };
