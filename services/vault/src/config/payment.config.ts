/**
 * Payment Configuration
 * 
 * Centralized, config-driven payment routing configuration.
 * All payment routing decisions MUST come from this config.
 * 
 * NO hardcoded gateway checks in controllers or services.
 */

export type PaymentProviderName = 'razorpay' | 'payu' | 'paddle' | 'revenuecat';
export type CountryCode = string;
export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | string;

export interface PaymentProviderConfig {
  enabled: boolean;
  supports: CountryCode[];
  supportedCurrencies: CurrencyCode[];
}

export interface PaymentRoutingConfig {
  [country: string]: PaymentProviderName;
}

export interface PaymentConfig {
  defaultProvider: PaymentProviderName;
  providers: {
    [key in PaymentProviderName]?: PaymentProviderConfig;
  };
  routing: PaymentRoutingConfig;
}

/**
 * Payment Configuration
 * 
 * Razorpay is PRIMARY for:
 * - India (IN) with INR
 * - International (GLOBAL) with USD, EUR, etc.
 * 
 * PayU is LEGACY and DISABLED via config
 */
export const PAYMENT_CONFIG: PaymentConfig = {
  defaultProvider: 'razorpay',
  
  providers: {
    razorpay: {
      enabled: true,
      supports: ['IN', 'GLOBAL'],
      supportedCurrencies: ['INR', 'USD', 'EUR', 'GBP'],
    },
    payu: {
      enabled: false, // LEGACY - Disabled but kept in codebase
      supports: ['IN'],
      supportedCurrencies: ['INR'],
    },
    // Future providers
    paddle: {
      enabled: false,
      supports: ['GLOBAL'],
      supportedCurrencies: ['USD', 'EUR', 'GBP'],
    },
    revenuecat: {
      enabled: false,
      supports: ['GLOBAL'],
      supportedCurrencies: ['USD', 'EUR', 'GBP'],
    },
  },
  
  routing: {
    IN: 'razorpay',
    GLOBAL: 'razorpay',
  },
};

/**
 * Get payment provider for given country and currency
 * Uses config-driven routing logic
 */
export function getProviderForCountryAndCurrency(
  country?: CountryCode,
  currency?: CurrencyCode
): PaymentProviderName {
  const userCountry = (country || 'IN').toUpperCase();
  const userCurrency = (currency || 'INR').toUpperCase();
  
  // Check routing config first
  const routedProvider = PAYMENT_CONFIG.routing[userCountry];
  if (routedProvider) {
    const providerConfig = PAYMENT_CONFIG.providers[routedProvider];
    if (providerConfig?.enabled) {
      // Verify currency is supported
      if (providerConfig.supportedCurrencies.includes(userCurrency)) {
        return routedProvider;
      }
    }
  }
  
  // Fallback: Use GLOBAL routing
  const globalProvider = PAYMENT_CONFIG.routing['GLOBAL'];
  if (globalProvider) {
    const providerConfig = PAYMENT_CONFIG.providers[globalProvider];
    if (providerConfig?.enabled) {
      if (providerConfig.supportedCurrencies.includes(userCurrency)) {
        return globalProvider;
      }
    }
  }
  
  // Final fallback: default provider
  const defaultProviderConfig = PAYMENT_CONFIG.providers[PAYMENT_CONFIG.defaultProvider];
  if (defaultProviderConfig?.enabled) {
    if (defaultProviderConfig.supportedCurrencies.includes(userCurrency)) {
      return PAYMENT_CONFIG.defaultProvider;
    }
  }
  
  throw new Error(
    `No enabled payment provider found for country: ${userCountry}, currency: ${userCurrency}`
  );
}

/**
 * Check if provider is enabled
 */
export function isProviderEnabled(provider: PaymentProviderName): boolean {
  return PAYMENT_CONFIG.providers[provider]?.enabled === true;
}

/**
 * Get provider config
 */
export function getProviderConfig(provider: PaymentProviderName): PaymentProviderConfig | undefined {
  return PAYMENT_CONFIG.providers[provider];
}

