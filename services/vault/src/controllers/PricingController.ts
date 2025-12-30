/**
 * Pricing Controller
 * 
 * Handles HTTP requests for pricing plans and configuration.
 * Follows existing controller patterns in the codebase.
 */

import { Request, Response } from 'express';
import logger from '../logger';

// TODO: Move this to a pricing config service
const PRICING_PLANS = {
  INR: [
    {
      id: 'individual',
      name: 'Individual',
      description: 'For individuals starting out',
      features: [
        'Unlimited AI prompts',
        'Priority response speed',
        'Advanced analytics dashboard',
      ],
      monthlyPrice: { amount: 799, currency: 'INR' },
      yearlyPrice: { amount: 7999, currency: 'INR' },
    },
    {
      id: 'family',
      name: 'Family',
      description: 'Perfect for professionals',
      features: [
        'Unlimited AI prompts',
        'Priority response speed',
        'Advanced analytics dashboard',
        'API access',
        '24/7 priority support',
      ],
      monthlyPrice: { amount: 1599, currency: 'INR' },
      yearlyPrice: { amount: 15999, currency: 'INR' },
      isPopular: true,
      isRecommended: true,
    },
    {
      id: 'business',
      name: 'Business',
      description: 'Tailored for businesses',
      features: [
        'Unlimited AI prompts',
        'Priority response speed',
        'Advanced analytics dashboard',
        'API access',
        '24/7 priority support',
        'Family sharing',
        'Advanced attachments',
      ],
      monthlyPrice: { amount: 2499, currency: 'INR' },
      yearlyPrice: { amount: 24999, currency: 'INR' },
    },
  ],
  USD: [
    {
      id: 'family',
      name: 'Family',
      description: 'For individuals who need more',
      features: [
        'Unlimited Safes & Items',
        'Secure Sharing',
        'Attachments',
        'Unlimited Devices',
        'Activity Logs',
      ],
      monthlyPrice: { amount: 1.99, currency: 'USD' },
      yearlyPrice: { amount: 19.99, currency: 'USD' },
      isRecommended: true,
    },
    {
      id: 'team',
      name: 'Team',
      description: 'Advanced security for families & power users',
      features: [
        'Everything in Family',
        'Family Sharing (up to 5 users)',
        'Advanced Access Control',
        'Larger Attachments',
        'Emergency Access',
      ],
      monthlyPrice: { amount: 3.99, currency: 'USD' },
      yearlyPrice: { amount: 39.99, currency: 'USD' },
    },
  ],
  EUR: [
    {
      id: 'family',
      name: 'Family',
      description: 'For individuals who need more',
      features: [
        'Unlimited Safes & Items',
        'Secure Sharing',
        'Attachments',
        'Unlimited Devices',
        'Activity Logs',
      ],
      monthlyPrice: { amount: 1.99, currency: 'EUR' },
      yearlyPrice: { amount: 19.99, currency: 'EUR' },
      isRecommended: true,
    },
    {
      id: 'team',
      name: 'Team',
      description: 'Advanced security for families & power users',
      features: [
        'Everything in Family',
        'Family Sharing (up to 5 users)',
        'Advanced Access Control',
        'Larger Attachments',
        'Emergency Access',
      ],
      monthlyPrice: { amount: 3.99, currency: 'EUR' },
      yearlyPrice: { amount: 39.99, currency: 'EUR' },
    },
  ],
  GBP: [
    {
      id: 'family',
      name: 'Family',
      description: 'For individuals who need more',
      features: [
        'Unlimited Safes & Items',
        'Secure Sharing',
        'Attachments',
        'Unlimited Devices',
        'Activity Logs',
      ],
      monthlyPrice: { amount: 1.99, currency: 'GBP' },
      yearlyPrice: { amount: 19.99, currency: 'GBP' },
      isRecommended: true,
    },
    {
      id: 'team',
      name: 'Team',
      description: 'Advanced security for families & power users',
      features: [
        'Everything in Family',
        'Family Sharing (up to 5 users)',
        'Advanced Access Control',
        'Larger Attachments',
        'Emergency Access',
      ],
      monthlyPrice: { amount: 3.99, currency: 'GBP' },
      yearlyPrice: { amount: 39.99, currency: 'GBP' },
    },
  ],
};

/**
 * Get pricing plans
 * 
 * @route GET /pricing/plans
 * @access Public
 */
export const getPricingPlans = async (req: Request, res: Response): Promise<void> => {
  try {
    const currency = (req.query.currency as string) || 'USD';
    // Support INR, USD, EUR, GBP - fallback to USD for unsupported currencies
    const currencyKey = ['INR', 'USD', 'EUR', 'GBP'].includes(currency) ? currency : 'USD';
    const plans = PRICING_PLANS[currencyKey as keyof typeof PRICING_PLANS] || PRICING_PLANS.USD;

    res.status(200).json({
      plans,
    });
  } catch (error: any) {
    logger.error(error, 'Error fetching pricing plans');
    res.status(500).json({
      message: 'Internal Server Error',
      error: error.message || 'Failed to fetch pricing plans',
    });
  }
};

/**
 * Get pricing configuration
 * 
 * @route GET /pricing/config
 * @access Public
 */
export const getPricingConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const currency = (req.query.currency as string) || 'USD';
    // Support INR, USD, EUR, GBP - fallback to USD for unsupported currencies
    const currencyKey = ['INR', 'USD', 'EUR', 'GBP'].includes(currency) ? currency : 'USD';
    const plans = PRICING_PLANS[currencyKey as keyof typeof PRICING_PLANS] || PRICING_PLANS.USD;

    const config = {
      plans,
      trialDays: 7,
      trialMessage: 'All plans include a 7-day free trial. Cancel anytime.',
      currency: currencyKey,
      taxRate: currencyKey === 'INR' ? 18 : 0,
      taxLabel: currencyKey === 'INR' ? 'GST' : undefined,
      encryptionMessage: 'Your data is encrypted with AES-256',
      termsUrl: 'https://novasafe.app/terms',
      privacyUrl: 'https://novasafe.app/privacy',
    };

    res.status(200).json({
      config,
    });
  } catch (error: any) {
    logger.error(error, 'Error fetching pricing config');
    res.status(500).json({
      message: 'Internal Server Error',
      error: error.message || 'Failed to fetch pricing config',
    });
  }
};

