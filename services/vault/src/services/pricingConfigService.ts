/**
 * Pricing Config Service
 * 
 * Centralized pricing configuration service.
 * Should be moved to database or config file in production.
 */

export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP';
export type PlanId = 'basic' | 'pro' | 'premium' | 'enterprise' | 'free';
export type BillingPeriod = 'monthly' | 'yearly' | 'one_time';

interface PlanPricing {
  monthly: number;
  yearly: number;
  one_time: number;
}

const PRICING_MAP: Record<Currency, Record<PlanId, PlanPricing>> = {
  INR: {
    basic: { monthly: 799, yearly: 7999, one_time: 7999 },
    pro: { monthly: 1599, yearly: 15999, one_time: 15999 },
    enterprise: { monthly: 2499, yearly: 24999, one_time: 24999 },
    premium: { monthly: 2499, yearly: 24999, one_time: 24999 },
    free: { monthly: 0, yearly: 0, one_time: 0 },
  },
  USD: {
    basic: { monthly: 0, yearly: 0, one_time: 0 },
    pro: { monthly: 1.99, yearly: 19.99, one_time: 19.99 },
    premium: { monthly: 3.99, yearly: 39.99, one_time: 39.99 },
    enterprise: { monthly: 5.99, yearly: 59.99, one_time: 59.99 },
    free: { monthly: 0, yearly: 0, one_time: 0 },
  },
  EUR: {
    basic: { monthly: 0, yearly: 0, one_time: 0 },
    pro: { monthly: 1.99, yearly: 19.99, one_time: 19.99 },
    premium: { monthly: 3.99, yearly: 39.99, one_time: 39.99 },
    enterprise: { monthly: 5.99, yearly: 59.99, one_time: 59.99 },
    free: { monthly: 0, yearly: 0, one_time: 0 },
  },
  GBP: {
    basic: { monthly: 0, yearly: 0, one_time: 0 },
    pro: { monthly: 1.99, yearly: 19.99, one_time: 19.99 },
    premium: { monthly: 3.99, yearly: 39.99, one_time: 39.99 },
    enterprise: { monthly: 5.99, yearly: 59.99, one_time: 59.99 },
    free: { monthly: 0, yearly: 0, one_time: 0 },
  },
};

/**
 * Get plan price for given currency and billing period
 */
export const getPlanPrice = (
  planId: PlanId,
  billingPeriod: BillingPeriod,
  currency: Currency
): number => {
  const pricing = PRICING_MAP[currency]?.[planId];
  if (!pricing) {
    return 0;
  }

  return pricing[billingPeriod] || 0;
};

/**
 * Get tax rate for currency
 */
export const getTaxRate = (currency: Currency): number => {
  if (currency === 'INR') {
    return 18; // 18% GST for India
  }
  // VAT rates for EU/UK (can be configured per country)
  if (currency === 'EUR' || currency === 'GBP') {
    return 0; // Default to 0, can be configured per country
  }
  return 0; // No tax for USD and others
};

