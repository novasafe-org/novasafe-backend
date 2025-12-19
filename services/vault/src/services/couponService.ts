/**
 * Coupon Service
 * 
 * Handles coupon validation and discount calculation.
 * Follows SOLID principles with single responsibility.
 */

import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { ICoupon, DiscountType } from '../models/Coupon';
import logger from '../logger';

const collection = DBCONFIG.vault.collections;

export interface CouponValidationResult {
  valid: boolean;
  discount?: {
    type: DiscountType;
    value: number;
  };
  error?: string;
}

/**
 * Get coupon by code
 */
export const getCouponByCode = async (code: string): Promise<ICoupon | null> => {
  try {
    const db = new Database('vault');
    const coupon = await db.findOne(collection.coupons, {
      code: code.toUpperCase(),
      isActive: true,
    }) as ICoupon | null;

    return coupon;
  } catch (error: any) {
    logger.error(error, 'Error fetching coupon');
    return null;
  }
};

/**
 * Check if coupon has been used by user
 */
const hasUserUsedCoupon = async (
  couponId: string | ObjectId,
  userId: string | ObjectId
): Promise<boolean> => {
  try {
    const db = new Database('vault');
    // Get coupon by ID to find its code
    const coupon = await db.findOne(collection.coupons, {
      _id: new ObjectId(couponId),
    }) as ICoupon | null;

    if (!coupon) {
      return false;
    }

    // Check payment orders for this coupon and user
    const orders = await db.findMany(collection.paymentOrders, {
      userId: new ObjectId(userId),
      couponCode: coupon.code.toUpperCase(),
      status: 'completed',
    });

    return (orders?.length || 0) > 0;
  } catch (error: any) {
    logger.error(error, 'Error checking coupon usage');
    return false;
  }
};

/**
 * Validate coupon code
 */
export const validateCoupon = async (
  code: string,
  planId: string,
  billingPeriod: 'monthly' | 'yearly' | 'one_time',
  userId: string
): Promise<CouponValidationResult> => {
  try {
    const coupon = await getCouponByCode(code);

    if (!coupon) {
      return {
        valid: false,
        error: 'Invalid coupon code',
      };
    }

    // Check validity dates
    const now = new Date();
    if (now < coupon.validFrom) {
      return {
        valid: false,
        error: 'Coupon is not yet valid',
      };
    }

    if (now > coupon.validUntil) {
      return {
        valid: false,
        error: 'Coupon has expired',
      };
    }

    // Check usage limits
    if (coupon.maxUsage !== null && coupon.usageCount >= coupon.maxUsage) {
      return {
        valid: false,
        error: 'Coupon usage limit reached',
      };
    }

    // Check per-user usage limit
    const userUsed = await hasUserUsedCoupon(coupon._id!.toString(), userId);
    if (userUsed) {
      return {
        valid: false,
        error: 'You have already used this coupon',
      };
    }

    // Check plan restrictions
    if (
      coupon.applicablePlanIds.length > 0 &&
      !coupon.applicablePlanIds.includes(planId)
    ) {
      return {
        valid: false,
        error: 'Coupon is not applicable to this plan',
      };
    }

    // Check period restrictions
    if (
      coupon.applicablePeriods.length > 0 &&
      !coupon.applicablePeriods.includes(billingPeriod)
    ) {
      return {
        valid: false,
        error: 'Coupon is not applicable to this billing period',
      };
    }

    return {
      valid: true,
      discount: {
        type: coupon.discountType,
        value: coupon.discountValue,
      },
    };
  } catch (error: any) {
    logger.error(error, 'Error validating coupon');
    return {
      valid: false,
      error: 'Error validating coupon',
    };
  }
};

/**
 * Apply coupon discount to amount
 */
export const applyCouponDiscount = async (
  code: string,
  amount: number,
  discount: { type: DiscountType; value: number }
): Promise<number> => {
  try {
    if (discount.type === 'percentage') {
      // Percentage discount (0-100)
      const discountAmount = (amount * discount.value) / 100;
      return Math.round(discountAmount * 100) / 100;
    } else {
      // Fixed amount discount
      return Math.min(discount.value, amount);
    }
  } catch (error: any) {
    logger.error(error, 'Error applying coupon discount');
    return 0;
  }
};

/**
 * Increment coupon usage count
 */
export const incrementCouponUsage = async (code: string): Promise<void> => {
  try {
    const db = new Database('vault');
    await db.updateOne(
      collection.coupons,
      { code: code.toUpperCase() },
      {
        $inc: { usageCount: 1 },
        $set: { updatedAt: new Date() },
      }
    );
  } catch (error: any) {
    logger.error(error, 'Error incrementing coupon usage');
  }
};

