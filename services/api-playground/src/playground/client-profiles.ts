/**
 * Platform client simulation profiles — inject canonical NovaSafe headers.
 */
export interface ClientProfile {
  id: string;
  label: string;
  description: string;
  headers: Record<string, string>;
}

export const CLIENT_PROFILES: ClientProfile[] = [
  {
    id: 'MOBILE_ANDROID',
    label: 'Mobile (Android)',
    description: 'Android app client',
    headers: {
      'x-client-source': 'MOBILE_ANDROID',
      'x-client-platform': 'android',
      'x-api-version': '1',
      'x-client-version': '1.0.0',
      'x-build-version': '100',
    },
  },
  {
    id: 'MOBILE_IOS',
    label: 'Mobile (iOS)',
    description: 'iOS app client',
    headers: {
      'x-client-source': 'MOBILE_IOS',
      'x-client-platform': 'ios',
      'x-api-version': '1',
      'x-client-version': '1.0.0',
      'x-build-version': '100',
    },
  },
  {
    id: 'WEB_APP',
    label: 'Web App',
    description: 'Browser web application',
    headers: {
      'x-client-source': 'WEB_APP',
      'x-client-platform': 'web',
      'x-api-version': '1',
    },
  },
  {
    id: 'BROWSER_EXTENSION',
    label: 'Browser Extension',
    description: 'Chrome / extension client',
    headers: {
      'x-client-source': 'BROWSER_EXTENSION',
      'x-client-platform': 'extension',
      'x-api-version': '1',
    },
  },
  {
    id: 'DESKTOP_APP',
    label: 'Desktop App',
    description: 'Desktop native client',
    headers: {
      'x-client-source': 'DESKTOP_APP',
      'x-client-platform': 'macos',
      'x-api-version': '1',
    },
  },
  {
    id: 'ADMIN_PANEL',
    label: 'Admin Panel',
    description: 'Internal admin dashboard',
    headers: {
      'x-client-source': 'ADMIN_PANEL',
      'x-client-platform': 'web',
      'x-api-version': '1',
    },
  },
];

export const getClientProfile = (id: string | undefined): ClientProfile | undefined =>
  CLIENT_PROFILES.find((p) => p.id === id);

export const DEFAULT_CLIENT_PROFILE_ID = 'WEB_APP';
