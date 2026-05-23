import { appConfig } from '../config';
import { authOpenApiComponents, buildAuthOpenApiPaths } from './modules/auth.openapi';
import { buildVaultOpenApiPaths } from './modules/vault.openapi';
import type { OpenApiDocument } from './types/openapi.types';

export interface BuildOpenApiOptions {
  baseUrl?: string;
}

/**
 * Central OpenAPI document builder. Add module paths via `./modules/*.openapi.ts`.
 */
export const buildOpenApiDocument = (options: BuildOpenApiOptions = {}): OpenApiDocument => {
  const baseUrl = options.baseUrl || `http://127.0.0.1:${appConfig.port}`;

  return {
    openapi: '3.1.0',
    info: {
      title: 'NovaSafe Core API',
      version: '1.0.0',
      description:
        'Unified NovaSafe platform API (auth, vault, sharing). Use platform headers for multi-client simulation. Trust layer verifies client identity separately from declared headers.',
      contact: { name: 'NovaSafe Engineering' },
    },
    servers: [
      { url: baseUrl, description: 'Current target' },
      { url: 'http://127.0.0.1:3125', description: 'Local core' },
      { url: '{environmentUrl}', description: 'Environment variable', variables: { environmentUrl: { default: baseUrl } } },
    ],
    tags: [
      { name: 'Auth', description: 'Authentication and sessions' },
      { name: 'OAuth', description: 'Google and Apple OAuth' },
      { name: 'Onboarding', description: 'Signup and email OTP' },
      { name: 'System', description: 'Health and metadata' },
      { name: 'Vault', description: 'Credentials, custom fields, sync' },
      { name: 'Vault (Legacy)', description: 'Legacy /mobile/vault paths' },
      { name: 'Sync', description: 'Vault bulk upload and delta pull' },
    ],
    paths: {
      ...buildAuthOpenApiPaths(),
      ...buildVaultOpenApiPaths(),
    },
    components: authOpenApiComponents,
    'x-platform-headers': {
      'x-client-source': 'MOBILE_ANDROID | MOBILE_IOS | WEB_APP | BROWSER_EXTENSION | DESKTOP_APP | ADMIN_PANEL',
      'x-client-platform': 'android | ios | web | windows | macos | extension',
      'x-client-id': 'Registered client ID (trust registry)',
      'x-client-signature': 'HMAC request signature (when enabled)',
      'x-client-timestamp': 'Unix ms or ISO timestamp for replay protection',
      'x-client-nonce': 'Unique nonce per request',
    },
  };
};
