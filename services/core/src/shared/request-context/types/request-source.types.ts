/**
 * Canonical client identity for the unified platform.
 * Do not hardcode strings in business logic — use these enums.
 */
export enum RequestSource {
  MobileAndroid = 'MOBILE_ANDROID',
  MobileIos = 'MOBILE_IOS',
  WebApp = 'WEB_APP',
  BrowserExtension = 'BROWSER_EXTENSION',
  DesktopApp = 'DESKTOP_APP',
  AdminPanel = 'ADMIN_PANEL',
  InternalService = 'INTERNAL_SERVICE',
  PublicApi = 'PUBLIC_API',
  Unknown = 'UNKNOWN',
}

/** OS / runtime surface (orthogonal to RequestSource). */
export enum ClientPlatform {
  Android = 'android',
  Ios = 'ios',
  Web = 'web',
  Windows = 'windows',
  Macos = 'macos',
  Linux = 'linux',
  Extension = 'extension',
  Unknown = 'unknown',
}

/** Maps RequestSource → persisted `source` field (mobile_vault compatibility). */
export enum LegacyClientSource {
  Mobile = 'mobile',
  Web = 'web',
  Extension = 'extension',
  Admin = 'admin',
  System = 'system',
}
