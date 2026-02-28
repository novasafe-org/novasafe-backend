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
 * APP_ORIGIN: when set (e.g. http://localhost:8080), all redirects go to this origin + VAULT_PATH (for local dev: auth → app)
 */
const getRedirectConfig = (): RedirectUrlConfig & { appOrigin?: string } => {
  const vaultPath = process.env.VAULT_PATH || '/vault';
  const appOrigin = process.env.APP_ORIGIN?.replace(/\/$/, ''); // e.g. http://localhost:8080
  return {
    baseDomain: process.env.BASE_DOMAIN || 'novasafe.io',
    individualSubdomain: process.env.INDIVIDUAL_SUBDOMAIN || 'app',
    vaultPath,
    protocol: (process.env.PROTOCOL as 'http' | 'https') || 'https',
    appOrigin,
  };
};

/**
 * Generate redirect URL based on plan and company
 * When APP_ORIGIN is set (local dev), returns APP_ORIGIN + vaultPath so auth app redirects to main app.
 *
 * @param planId - User's plan ID ('individual', 'family', 'team', 'business')
 * @param companyName - Company name (for team/business plans)
 * @returns Full redirect URL
 */
export const getRedirectUrl = (planId: string, companyName?: string | null): string => {
  const config = getRedirectConfig();
  const plan = (planId || 'individual').toLowerCase();
  const protocol = config.protocol || 'https';

  // Local dev: single app origin (auth and app run on different ports)
  if (config.appOrigin) {
    return `${config.appOrigin}${config.vaultPath}`;
  }

  // Individual or Family plan
  if (plan === 'individual' || plan === 'family') {
    return `${protocol}://${config.individualSubdomain}.${config.baseDomain}${config.vaultPath}`;
  }

  // Team or Business plan
  if (plan === 'team' || plan === 'business') {
    if (!companyName) {
      return `${protocol}://${config.individualSubdomain}.${config.baseDomain}${config.vaultPath}`;
    }
    const normalizedCompany = companyName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return `${protocol}://${normalizedCompany}.${config.baseDomain}${config.vaultPath}`;
  }

  return `${protocol}://${config.individualSubdomain}.${config.baseDomain}${config.vaultPath}`;
};

