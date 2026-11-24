import type { Request } from 'express';
import { getRequestContext } from '../../../shared/request-context';
import { ClientPlatform, RequestSource } from '../../../shared/request-context/types/request-source.types';

/**
 * True for native mobile app clients (Flutter Android/iOS).
 * Web app / extension / desktop browser are excluded from refresh + step-up.
 */
const NON_MOBILE_SOURCES = new Set<RequestSource>([
  RequestSource.WebApp,
  RequestSource.BrowserExtension,
  RequestSource.DesktopApp,
  RequestSource.AdminPanel,
  RequestSource.InternalService,
  RequestSource.PublicApi,
]);

export const isMobileAppClient = (req: Request): boolean => {
  const snap = getRequestContext()?.snapshot;
  if (snap) {
    const source = snap.verifiedSource || snap.declaredSource;
    if (
      source === RequestSource.MobileAndroid ||
      source === RequestSource.MobileIos
    ) {
      return true;
    }
    if (source && NON_MOBILE_SOURCES.has(source)) {
      return false;
    }
    if (snap.platform === ClientPlatform.Android || snap.platform === ClientPlatform.Ios) {
      return true;
    }
    if (
      snap.platform === ClientPlatform.Web ||
      snap.platform === ClientPlatform.Extension ||
      snap.platform === ClientPlatform.Windows ||
      snap.platform === ClientPlatform.Macos ||
      snap.platform === ClientPlatform.Linux
    ) {
      return false;
    }
  }

  const header = String(req.headers['x-client-source'] || '').toUpperCase();
  if (header === 'MOBILE_ANDROID' || header === 'MOBILE_IOS') return true;
  if (
    header === 'WEB_APP' ||
    header === 'WEB' ||
    header === 'EXTENSION' ||
    header === 'BROWSER_EXTENSION' ||
    header === 'MOBILE_WEB' ||
    header === 'DESKTOP_APP'
  ) {
    return false;
  }

  // Legacy body/platform hints from mobile clients.
  const platform = String(req.body?.devicePlatform || '').toLowerCase();
  return platform === 'android' || platform === 'ios';
};

export const isWebAppClient = (req: Request): boolean => {
  const snap = getRequestContext()?.snapshot;
  if (snap) {
    return (
      snap.platform === ClientPlatform.Web ||
      snap.declaredSource === RequestSource.WebApp ||
      snap.verifiedSource === RequestSource.WebApp
    );
  }
  const header = String(req.headers['x-client-source'] || '').toUpperCase();
  return header === 'WEB_APP' || header === 'WEB';
};
