import type { Types } from 'mongoose';
import type { IBaseEntityDocument } from '../../core/base.entity';
import type {
  PlanTier,
  SubscriptionLifecycleStatus,
  SubscriptionProvider,
  WebhookEventStatus,
} from './subscription.enums';

export interface SubscriptionLimits {
  maxPasswords: number;
  maxSecureNotes: number;
  maxDevices: number;
}

export interface EntitlementMap {
  [key: string]: boolean;
}

/** Embedded state document (matches mobile_vault SubscriptionState shape). */
export interface ISubscriptionState {
  tier: PlanTier | string;
  isPro: boolean;
  productId: string | null;
  entitlementId: string | null;
  isActive: boolean;
  expiresAt: string | null;
  renewsAt: string | null;
  purchasedAt: string | null;
  lastRenewalAt: string | null;
  cancellationAt: string | null;
  inGracePeriod: boolean;
  billingIssueDetectedAt: string | null;
  trialEndsAt: string | null;
  platform: string | null;
  autoRenewing: boolean;
  subscriptionProvider: SubscriptionProvider | string;
  subscriptionStatus: SubscriptionLifecycleStatus | string;
  entitlements: EntitlementMap;
  limits: SubscriptionLimits;
  updatedAt: string;
}

export interface IUserSubscription extends IBaseEntityDocument {
  userId: Types.ObjectId;
  state: ISubscriptionState;
}

export interface ISubscriptionEvent extends IBaseEntityDocument {
  eventId: string;
  eventType: string;
  userId: Types.ObjectId | null;
  transactionId: string | null;
  status: WebhookEventStatus | string;
  payload: unknown;
  errorMessage?: string | null;
  processedAt: Date;
}

export interface IPurchaseHistory extends IBaseEntityDocument {
  userId: Types.ObjectId;
  eventId: string;
  eventType: string;
  productId: string | null;
  transactionId: string | null;
  store: string | null;
  environment: string | null;
  purchasedAt: Date | null;
}

export interface IEntitlementRecord extends IBaseEntityDocument {
  userId: Types.ObjectId;
  entitlementId: string;
  isActive: boolean;
  expiresAt: Date | null;
  productId: string | null;
  raw: Record<string, unknown>;
}
