/**
 * Payment Router
 * 
 * Routes payment requests to appropriate payment provider based on
 * user country and currency using config-driven routing.
 * 
 * NO hardcoded gateway checks - all routing comes from payment.config.ts
 */

import { IPaymentProvider } from './types';
import { payuProvider } from './providers/payuProvider';
import { razorpayProvider } from './providers/razorpayProvider';
import {
  getProviderForCountryAndCurrency,
  isProviderEnabled,
  PaymentProviderName,
} from '../../config/payment.config';
import logger from '../../logger';

/**
 * Available payment providers registry
 */
const providers = new Map<PaymentProviderName, IPaymentProvider>();
providers.set('razorpay', razorpayProvider);
providers.set('payu', payuProvider);
// Future providers will be added here:
// providers.set('paddle', paddleProvider);
// providers.set('revenuecat', revenueCatProvider);

/**
 * Get payment provider based on country and currency
 * Uses config-driven routing from payment.config.ts
 * 
 * NO hardcoded checks - all routing logic is in config
 */
export function getPaymentProvider(
  country?: string,
  currency?: string
): IPaymentProvider {
  try {
    // Get provider name from config
    const providerName = getProviderForCountryAndCurrency(country, currency);
    
    // Check if provider is enabled
    if (!isProviderEnabled(providerName)) {
      throw new Error(`Payment provider ${providerName} is disabled in configuration`);
    }
    
    // Get provider instance
    const provider = providers.get(providerName);
    if (!provider) {
      throw new Error(`Payment provider ${providerName} not found in registry`);
    }
    
    logger.info(
      `Routing to ${providerName} provider for country: ${country || 'IN'}, currency: ${currency || 'INR'}`
    );
    
    return provider;
  } catch (error: any) {
    logger.error(error, 'Error getting payment provider');
    throw error;
  }
}

/**
 * Get payment provider by name
 */
export function getProviderByName(providerName: string): IPaymentProvider {
  const normalizedName = providerName.toLowerCase() as PaymentProviderName;
  const provider = providers.get(normalizedName);
  if (!provider) {
    throw new Error(`Payment provider not found: ${providerName}`);
  }
  return provider;
}

/**
 * Register a new payment provider
 */
export function registerProvider(provider: IPaymentProvider): void {
  providers.set(provider.provider, provider);
  logger.info(`Registered payment provider: ${provider.provider}`);
}

/**
 * Get all registered providers
 */
export function getAllProviders(): IPaymentProvider[] {
  return Array.from(providers.values());
}


