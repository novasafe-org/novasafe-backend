export enum PlanTier {
  Free = 'free',
  Pro = 'pro',
}

export enum SubscriptionProvider {
  RevenueCat = 'revenuecat',
}

export enum SubscriptionLifecycleStatus {
  Active = 'active',
  Inactive = 'inactive',
  Cancelled = 'cancelled',
  Expired = 'expired',
  BillingIssue = 'billing_issue',
  GracePeriod = 'grace_period',
}

export enum WebhookEventStatus {
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
  Ignored = 'ignored',
}
