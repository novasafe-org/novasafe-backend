/**
 * Pricing Routes
 * 
 * Handles all pricing-related endpoints.
 * 
 * BASE PATH: /v/pricing
 */

import express from 'express';
import { getPricingPlans, getPricingConfig } from '../controllers/PricingController';

const router = express.Router();

/**
 * @route   GET /v/pricing/plans
 * @desc    Get all pricing plans
 * @access  Public
 * 
 * QUERY PARAMS:
 * ?currency=INR (optional, defaults to USD)
 * 
 * RESPONSE:
 * {
 *   "plans": [
 *     {
 *       "id": "pro",
 *       "name": "Pro",
 *       "description": "Perfect for professionals",
 *       "features": [...],
 *       "monthlyPrice": { "amount": 1599, "currency": "INR" },
 *       "yearlyPrice": { "amount": 15999, "currency": "INR" },
 *       "isPopular": true
 *     }
 *   ]
 * }
 */
router.get('/plans', getPricingPlans);

/**
 * @route   GET /v/pricing/config
 * @desc    Get pricing configuration
 * @access  Public
 * 
 * QUERY PARAMS:
 * ?currency=INR (optional, defaults to USD)
 * 
 * RESPONSE:
 * {
 *   "config": {
 *     "plans": [...],
 *     "trialDays": 7,
 *     "trialMessage": "All plans include a 7-day free trial...",
 *     "currency": "INR",
 *     "taxRate": 18,
 *     "taxLabel": "GST",
 *     "encryptionMessage": "Your data is encrypted...",
 *     "termsUrl": "https://novasafe.app/terms",
 *     "privacyUrl": "https://novasafe.app/privacy"
 *   }
 * }
 */
router.get('/config', getPricingConfig);

export default router;

