/**
 * Redirect URL Utility
 * 
 * Generates redirect URLs based on user plan and company name
 * Supports multi-tenant domain architecture:
 * - Individual/Family: app.novasafe.io/vault
 * - Team/Business: <company>.novasafe.io/vault
 */

interface RedirectUrlConfig {
  baseDomain: string;
  individualSubdomain: string;
  vaultPath: string;
  protocol?: 'http' | 'https';
}

/**
 * Get redirect URL configuration from environment variables
 */
const getRedirectConfig = (): RedirectUrlConfig => {
  return {
    baseDomain: process.env.BASE_DOMAIN || 'novasafe.io',
    individualSubdomain: process.env.INDIVIDUAL_SUBDOMAIN || 'app',
    vaultPath: process.env.VAULT_PATH || '/vault',
    protocol: (process.env.PROTOCOL as 'http' | 'https') || 'https',
  };
};

/**
 * Generate redirect URL based on plan and company
 * 
 * @param planId - User's plan ID ('individual', 'family', 'team', 'business')
 * @param companyName - Company name (for team/business plans)
 * @returns Full redirect URL
 */
export const getRedirectUrl = (planId: string, companyName?: string | null): string => {
  const config = getRedirectConfig();
  const plan = (planId || 'individual').toLowerCase();
  const protocol = config.protocol || 'https';

  // Individual or Family plan
  if (plan === 'individual' || plan === 'family') {
    return `${protocol}://${config.individualSubdomain}.${config.baseDomain}${config.vaultPath}`;
  }

  // Team or Business plan
  if (plan === 'team' || plan === 'business') {
    if (!companyName) {
      // Fallback to individual if no company name
      return `${protocol}://${config.individualSubdomain}.${config.baseDomain}${config.vaultPath}`;
    }

    // Normalize company name for subdomain (lowercase, replace spaces/special chars)
    const normalizedCompany = companyName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return `${protocol}://${normalizedCompany}.${config.baseDomain}${config.vaultPath}`;
  }

  // Default to individual
  return `${protocol}://${config.individualSubdomain}.${config.baseDomain}${config.vaultPath}`;
};

