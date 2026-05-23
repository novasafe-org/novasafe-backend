import {
  ClientPlatform,
  LegacyClientSource,
  RequestSource,
  type HttpIncomingMessage,
  type ParsedRequestSource,
  type PlatformCapability,
} from '../types';
import { REQUEST_CONTEXT_HEADERS, REQUEST_CONTEXT_LIMITS } from '../constants';
import { extractHeaderString } from './trace.util';
import { resolveDefaultCapabilities } from '../capabilities/platform-capabilities';

const normalizeToken = (value: string): string =>
  value.trim().toUpperCase().replace(/[\s-]+/g, '_');

const SOURCE_ALIASES: Record<string, RequestSource> = {
  MOBILE_ANDROID: RequestSource.MobileAndroid,
  ANDROID: RequestSource.MobileAndroid,
  MOBILE_IOS: RequestSource.MobileIos,
  IOS: RequestSource.MobileIos,
  IPHONE: RequestSource.MobileIos,
  MOBILE: RequestSource.MobileIos,
  WEB_APP: RequestSource.WebApp,
  WEB: RequestSource.WebApp,
  BROWSER_EXTENSION: RequestSource.BrowserExtension,
  EXTENSION: RequestSource.BrowserExtension,
  CHROME_EXTENSION: RequestSource.BrowserExtension,
  DESKTOP_APP: RequestSource.DesktopApp,
  DESKTOP: RequestSource.DesktopApp,
  ADMIN_PANEL: RequestSource.AdminPanel,
  ADMIN: RequestSource.AdminPanel,
  INTERNAL_SERVICE: RequestSource.InternalService,
  INTERNAL: RequestSource.InternalService,
  PUBLIC_API: RequestSource.PublicApi,
  API: RequestSource.PublicApi,
};

const PLATFORM_ALIASES: Record<string, ClientPlatform> = {
  ANDROID: ClientPlatform.Android,
  IOS: ClientPlatform.Ios,
  IPHONE: ClientPlatform.Ios,
  WEB: ClientPlatform.Web,
  WINDOWS: ClientPlatform.Windows,
  WIN: ClientPlatform.Windows,
  MACOS: ClientPlatform.Macos,
  MAC: ClientPlatform.Macos,
  DARWIN: ClientPlatform.Macos,
  LINUX: ClientPlatform.Linux,
  EXTENSION: ClientPlatform.Extension,
};

export const toSourceLabel = (source: RequestSource): string => `[${source}]`;

export const toLegacySource = (source: RequestSource): LegacyClientSource => {
  switch (source) {
    case RequestSource.MobileAndroid:
    case RequestSource.MobileIos:
      return LegacyClientSource.Mobile;
    case RequestSource.WebApp:
    case RequestSource.DesktopApp:
      return LegacyClientSource.Web;
    case RequestSource.BrowserExtension:
      return LegacyClientSource.Extension;
    case RequestSource.AdminPanel:
      return LegacyClientSource.Admin;
    case RequestSource.InternalService:
    case RequestSource.PublicApi:
      return LegacyClientSource.System;
    default:
      return LegacyClientSource.Mobile;
  }
};

const inferPlatformFromUserAgent = (ua: string): ClientPlatform => {
  const lower = ua.toLowerCase();
  if (lower.includes('android')) return ClientPlatform.Android;
  if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ios')) {
    return ClientPlatform.Ios;
  }
  if (lower.includes('windows')) return ClientPlatform.Windows;
  if (lower.includes('mac')) return ClientPlatform.Macos;
  if (lower.includes('linux')) return ClientPlatform.Linux;
  if (lower.includes('chrome-extension') || lower.includes('firefox')) {
    return ClientPlatform.Extension;
  }
  return ClientPlatform.Web;
};

const inferSourceFromPlatform = (platform: ClientPlatform, hint?: RequestSource): RequestSource => {
  if (hint && hint !== RequestSource.Unknown) return hint;
  switch (platform) {
    case ClientPlatform.Android:
      return RequestSource.MobileAndroid;
    case ClientPlatform.Ios:
      return RequestSource.MobileIos;
    case ClientPlatform.Extension:
      return RequestSource.BrowserExtension;
    case ClientPlatform.Windows:
    case ClientPlatform.Macos:
    case ClientPlatform.Linux:
      return RequestSource.DesktopApp;
    default:
      return RequestSource.WebApp;
  }
};

const parseSourceHeader = (raw: string | undefined): RequestSource | undefined => {
  if (!raw) return undefined;
  return SOURCE_ALIASES[normalizeToken(raw)];
};

const parsePlatformHeader = (raw: string | undefined): ClientPlatform | undefined => {
  if (!raw) return undefined;
  return PLATFORM_ALIASES[normalizeToken(raw)];
};

const readBodyField = (body: unknown, key: string): string | undefined => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Parses and normalizes client source + platform from headers, body, and User-Agent.
 */
export const parseRequestSource = (message: HttpIncomingMessage): ParsedRequestSource => {
  const headers = message.headers;
  const ua = extractHeaderString(headers, 'user-agent') || '';
  const headerSource =
    parseSourceHeader(extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.CLIENT_SOURCE)) ||
    parseSourceHeader(extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.LEGACY_SOURCE)) ||
    parseSourceHeader(readBodyField(message.body, 'clientSource')) ||
    parseSourceHeader(readBodyField(message.body, 'source'));

  const headerPlatform =
    parsePlatformHeader(extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.CLIENT_PLATFORM)) ||
    parsePlatformHeader(readBodyField(message.body, 'devicePlatform')) ||
    parsePlatformHeader(readBodyField(message.body, 'platform'));

  const platform =
    headerPlatform ||
    (ua ? inferPlatformFromUserAgent(ua) : ClientPlatform.Unknown);

  let source =
    headerSource ||
    inferSourceFromPlatform(platform, headerSource);

  if (source === RequestSource.Unknown && readBodyField(message.body, 'source') === 'mobile') {
    source =
      platform === ClientPlatform.Android
        ? RequestSource.MobileAndroid
        : RequestSource.MobileIos;
  }

  const capabilities = resolveDefaultCapabilities(source);

  return {
    source,
    platform,
    legacySource: toLegacySource(source),
    sourceLabel: toSourceLabel(source),
    capabilities,
  };
};

export const parseDeviceContext = (message: HttpIncomingMessage) => {
  const headers = message.headers;
  const body = message.body;
  const ua = extractHeaderString(headers, 'user-agent');
  const deviceId = extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.DEVICE_ID);
  const deviceModel = readBodyField(body, 'deviceModel');
  const osVersion = readBodyField(body, 'deviceOsVersion');
  const platform =
    readBodyField(body, 'devicePlatform') ||
    extractHeaderString(headers, REQUEST_CONTEXT_HEADERS.CLIENT_PLATFORM);

  let deviceName = deviceModel || undefined;
  if (deviceModel && platform) {
    deviceName = `${deviceModel}${osVersion ? ` - ${platform} ${osVersion}` : ` - ${platform}`}`;
  } else if (ua) {
    deviceName = ua.slice(0, REQUEST_CONTEXT_LIMITS.MAX_USER_AGENT_LENGTH);
  }

  return {
    deviceId,
    deviceName,
    deviceModel,
    osVersion,
    userAgent: ua,
  };
};

export const resolveClientIp = (message: HttpIncomingMessage): string => {
  const forwarded = message.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).trim();
  }
  return message.remoteAddress || 'unknown';
};
