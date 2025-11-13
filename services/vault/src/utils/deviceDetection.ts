/**
 * Device Detection Utility
 * 
 * Parses user agent string to extract device information
 */

/**
 * Detect device type from user agent
 */
export const detectDevice = (userAgent: string): 'desktop' | 'mobile' | 'tablet' => {
  const ua = userAgent.toLowerCase();

  // Check for tablets first (they can be mobile too)
  if (ua.includes('tablet') || ua.includes('ipad') || (ua.includes('android') && !ua.includes('mobile'))) {
    return 'tablet';
  }

  // Check for mobile devices
  if (
    ua.includes('mobile') ||
    ua.includes('android') ||
    ua.includes('iphone') ||
    ua.includes('ipod') ||
    ua.includes('blackberry') ||
    ua.includes('windows phone')
  ) {
    return 'mobile';
  }

  // Default to desktop
  return 'desktop';
};

/**
 * Parse browser name and version from user agent
 */
export const parseBrowser = (userAgent: string): string => {
  const ua = userAgent.toLowerCase();

  if (ua.includes('edg')) {
    const match = userAgent.match(/Edg\/(\d+)/i);
    return match ? `Edge ${match[1]}` : 'Edge';
  }

  if (ua.includes('chrome') && !ua.includes('edg')) {
    const match = userAgent.match(/Chrome\/(\d+)/i);
    return match ? `Chrome ${match[1]}` : 'Chrome';
  }

  if (ua.includes('firefox')) {
    const match = userAgent.match(/Firefox\/(\d+)/i);
    return match ? `Firefox ${match[1]}` : 'Firefox';
  }

  if (ua.includes('safari') && !ua.includes('chrome')) {
    const match = userAgent.match(/Version\/(\d+)/i) || userAgent.match(/Safari\/(\d+)/i);
    return match ? `Safari ${match[1]}` : 'Safari';
  }

  if (ua.includes('opera') || ua.includes('opr')) {
    const match = userAgent.match(/OPR\/(\d+)/i) || userAgent.match(/Opera\/(\d+)/i);
    return match ? `Opera ${match[1]}` : 'Opera';
  }

  return 'Unknown Browser';
};

/**
 * Parse operating system from user agent
 */
export const parseOS = (userAgent: string): string => {
  const ua = userAgent.toLowerCase();

  if (ua.includes('windows nt 10')) return 'Windows 10/11';
  if (ua.includes('windows nt 6.3')) return 'Windows 8.1';
  if (ua.includes('windows nt 6.2')) return 'Windows 8';
  if (ua.includes('windows nt 6.1')) return 'Windows 7';
  if (ua.includes('windows nt')) return 'Windows';

  if (ua.includes('mac os x')) {
    const match = userAgent.match(/Mac OS X (\d+[._]\d+)/i);
    if (match) {
      const version = match[1].replace('_', '.');
      return `macOS ${version}`;
    }
    return 'macOS';
  }

  if (ua.includes('iphone')) {
    const match = userAgent.match(/OS (\d+[._]\d+)/i);
    if (match) {
      const version = match[1].replace('_', '.');
      return `iOS ${version}`;
    }
    return 'iOS';
  }

  if (ua.includes('android')) {
    const match = userAgent.match(/Android (\d+[._]\d+)/i);
    if (match) {
      return `Android ${match[1]}`;
    }
    return 'Android';
  }

  if (ua.includes('linux')) return 'Linux';
  if (ua.includes('ubuntu')) return 'Ubuntu';

  return 'Unknown OS';
};

/**
 * Extract IP address from request
 */
export const getClientIP = (req: any): string => {
  // Check for forwarded IP (when behind proxy/load balancer)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
  }

  // Check for real IP
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return Array.isArray(realIP) ? realIP[0] : realIP;
  }

  // Fallback to connection remote address
  return req.ip || req.connection?.remoteAddress || 'Unknown';
};

