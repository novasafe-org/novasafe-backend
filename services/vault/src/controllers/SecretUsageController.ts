/**
 * Secret Usage Controller
 * 
 * API endpoints for retrieving secret usage information.
 */

import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import logger from '../logger';
import { getSecretUsage } from '../services/secretUsageService';
import '../middlewares/auth'; // Extend Express Request type
import '../middlewares/machineAuth'; // Extend Express Request type for machineAuth

/**
 * Get usage information for a secret
 * 
 * @route GET /v/secrets/:id/usage
 * @access Protected (requires user JWT or machine auth)
 */
export const getSecretUsageController = async (req: Request, res: Response) => {
  try {
    // Support both user JWT (UI) and machine auth (API)
    const userId = req.machineAuth?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        message: 'Authentication required',
        error: 'Authentication required',
      });
    }

    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Validation error',
        error: 'Invalid secret ID format',
      });
    }

    const usageInfo = await getSecretUsage(userId, id);

    return res.status(200).json({
      success: true,
      data: usageInfo,
    });
  } catch (error: any) {
    logger.error(`Error fetching secret usage: ${error.message}`);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        message: 'Secret not found',
        error: error.message,
      });
    }

    return res.status(500).json({
      message: 'Failed to fetch secret usage',
      error: error.message,
    });
  }
};


