import type { Request } from 'express';
import { getRequestContext } from '../../../shared/request-context';
export interface DeviceInfo {
  deviceName: string;
  platform: string;
  userAgent: string;
}

export const resolveClientIp = (req: Request): string => {
  const ctx = getRequestContext();
  if (ctx) return ctx.snapshot.ip;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) return String(forwarded[0]);
  return req.socket.remoteAddress || 'Unknown';
};

export const resolveDeviceInfo = (req: Request): DeviceInfo => {
  const ctx = getRequestContext();
  if (ctx) {
    const d = ctx.snapshot.device;
    return {
      deviceName: d.deviceName || 'Unknown Device',
      platform: ctx.snapshot.platform,
      userAgent: d.userAgent || String(req.headers['user-agent'] || ''),
    };
  }

  const ua = String(req.headers['user-agent'] || 'Unknown Device');
  const lower = ua.toLowerCase();
  const requestPlatform = String(req.body?.devicePlatform || '').toLowerCase().trim();
  const requestModel = String(req.body?.deviceModel || '').trim();
  const requestOsVersion = String(req.body?.deviceOsVersion || '').trim();
  const platform = lower.includes('android')
    ? 'android'
    : lower.includes('iphone') || lower.includes('ios')
      ? 'ios'
      : lower.includes('windows')
        ? 'windows'
        : lower.includes('mac')
          ? 'macos'
          : 'web';
  const normalizedPlatform = requestPlatform || platform;
  const deviceName = requestModel
    ? `${requestModel}${requestOsVersion ? ` - ${normalizedPlatform} ${requestOsVersion}` : ` - ${normalizedPlatform}`}`
    : ua.slice(0, 80);
  return { deviceName, platform: normalizedPlatform, userAgent: ua };
};
