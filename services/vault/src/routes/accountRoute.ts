/**
 * Account Routes
 * 
 * BASE PATH: /v/account
 */

import express from 'express';
import { authMiddleware } from '../middlewares/auth';
import { getAccountDetails } from '../controllers/AccountController';

const router = express.Router();

/**
 * @route   GET /v/account
 * @desc    Get current user's account details
 * @access  Protected
 */
router.get('/', authMiddleware, getAccountDetails);

export default router;

