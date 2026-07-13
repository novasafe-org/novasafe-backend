import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { mixedType, objectIdType } from '../common/schema-types';
import type { IUserSubscription } from './subscription.interface';

const subscriptionDefinition = {
  userId: { type: objectIdType, ref: 'VaultUser', required: true },
  state: { type: mixedType, required: true },
};

export const UserSubscriptionSchema = createBaseSchema(subscriptionDefinition);

UserSubscriptionSchema.index({ userId: 1 }, { unique: true });

export const USER_SUBSCRIPTION_MODEL_NAME = 'UserSubscription';
export const USER_SUBSCRIPTION_COLLECTION = COLLECTIONS.subscriptions;

export type { IUserSubscription };
