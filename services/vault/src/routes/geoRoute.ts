/**
 * Geo Routes
 * 
 * Routes for geolocation and country detection
 */

import { Router } from 'express';
import { getCountryFromIP } from '../controllers/GeoController';

const router = Router();

/**
 * @route GET /geo/country
 * @desc Get user country from IP address
 * @access Public
 */
router.get('/country', getCountryFromIP);

export default router;

