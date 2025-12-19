/**
 * Geo Controller
 * 
 * Handles geolocation and country detection based on IP address
 */

import { Request, Response } from 'express';
import logger from '../logger';

/**
 * Get user country from IP address
 * 
 * @route GET /geo/country
 * @access Public
 */
export const getCountryFromIP = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get client IP address
    const clientIP = 
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      req.socket.remoteAddress ||
      req.ip ||
      '';

    logger.info(`Country detection request from IP: ${clientIP}`);

    // For now, return a default or use a simple detection
    // In production, you can use:
    // 1. MaxMind GeoIP2
    // 2. Cloudflare headers (if behind Cloudflare)
    // 3. External IP geolocation service
    
    // Check Cloudflare headers (if available)
    const cloudflareCountry = req.headers['cf-ipcountry'] as string;
    if (cloudflareCountry && cloudflareCountry !== 'XX') {
      logger.info(`Country detected from Cloudflare: ${cloudflareCountry}`);
      res.status(200).json({
        country: cloudflareCountry,
        source: 'cloudflare',
      });
      return;
    }

    // For development/testing, you can use a simple IP geolocation service
    // In production, use MaxMind GeoIP2 database or similar
    try {
      // Fallback: Use free IP geolocation service (for development)
      // In production, use MaxMind GeoIP2 or similar service
      const geoResponse = await fetch(`https://ipapi.co/${clientIP}/json/`, {
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(3000),
      });

      if (geoResponse.ok) {
        const geoData = await geoResponse.json() as { country_code?: string };
        const country = geoData.country_code || 'IN'; // Default to India
        
        logger.info(`Country detected from IP service: ${country}`);
        res.status(200).json({
          country,
          source: 'ipapi',
        });
        return;
      }
    } catch (geoError: any) {
      logger.warn(`IP geolocation service failed, using default: ${geoError.message}`);
    }

    // Default fallback: India (since most users are likely Indian)
    logger.info('Using default country: IN');
    res.status(200).json({
      country: 'IN',
      source: 'default',
    });
  } catch (error: any) {
    logger.error(error, 'Error detecting country from IP');
    // Return default on error
    res.status(200).json({
      country: 'IN',
      source: 'default',
      error: 'Failed to detect country, using default',
    });
  }
};

