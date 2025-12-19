/**
 * Coupon Model Interface
 * 
 * Represents discount coupons for pricing plans.
 * Supports both percentage and fixed amount discounts.
 */

import { ObjectId } from 'mongodb';

export type DiscountType = 'percentage' | 'fixed';

export interface ICoupon {
  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: ObjectId;

  /**
   * Unique coupon code (uppercase, alphanumeric)
   * Example: "WELCOME20", "SAVE50"
   */
  code: string;

  /**
   * Human-readable description of the coupon
   */
  description: string;

  /**
   * Discount type
   */
  discountType: DiscountType;

  /**
   * Discount value
   * For percentage: 0-100 (e.g., 20 for 20%)
   * For fixed: amount in smallest currency unit (e.g., 500 for ₹5.00)
   */
  discountValue: number;

  // ============================================
  // Validity & Usage Limits
  // ============================================

  /**
   * Start date when coupon becomes valid
   */
  validFrom: Date;

  /**
   * End date when coupon expires
   */
  validUntil: Date;

  /**
   * Maximum number of times coupon can be used
   * Optional: null for unlimited usage
   */
  maxUsage?: number | null;

  /**
   * Current usage count
   * Default: 0
   */
  usageCount: number;

  /**
   * Maximum number of times a single user can use this coupon
   * Default: 1
   */
  maxUsagePerUser: number;

  // ============================================
  // Plan & Period Restrictions
  // ============================================

  /**
   * Plan IDs this coupon applies to
   * Empty array means applies to all plans
   */
  applicablePlanIds: string[];

  /**
   * Billing periods this coupon applies to
   * Empty array means applies to all periods
   */
  applicablePeriods: ('monthly' | 'yearly' | 'one_time')[];

  // ============================================
  // Status
  // ============================================

  /**
   * Whether coupon is currently active
   * Default: true
   */
  isActive: boolean;

  // ============================================
  // Timestamps
  // ============================================

  /**
   * Timestamp when coupon was created
   */
  createdAt: Date;

  /**
   * Timestamp of last update
   */
  updatedAt: Date;
}

