/**
 * Request Utilities
 * 
 * Helper functions for extracting request metadata
 * Used for activity logging and security tracking
 */

import { Request } from 'express';

/**
 * Extract IP address from request
 * Handles proxies and load balancers
 */
export function getClientIp(req: Request): string | null {
  // Check various headers for IP (in order of preference)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return ips.split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (cfConnectingIp) {
    return Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp;
  }

  // Fallback to connection remote address
  return req.socket.remoteAddress || null;
}

/**
 * Extract user agent from request
 */
export function getUserAgent(req: Request): string | null {
  return req.headers['user-agent'] || null;
}

/**
 * Extract location from IP (placeholder - can be enhanced with geolocation service)
 * For now, returns null - can be integrated with IP geolocation API later
 */
export function getLocationFromIp(ip: string | null): string | null {
  // TODO: Integrate with IP geolocation service (e.g., ipapi.co, MaxMind)
  // For now, return null
  return null;
}

