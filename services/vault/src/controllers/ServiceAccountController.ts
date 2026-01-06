/**
 * Service Account Controller
 * 
 * API endpoints for managing Service Accounts.
 * Service Accounts use Client ID + Client Secret authentication.
 */

import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import logger from '../logger';
import {
  createServiceAccount,
  listServiceAccounts,
  revokeServiceAccount,
  getServiceAccountById,
} from '../services/serviceAccountService';
import '../middlewares/auth'; // Extend Express Request type

/**
 * Create a new Service Account
 * 
 * @route POST /v/service-accounts
 * @access Protected (requires user JWT - UI only)
 */
export const createServiceAccountController = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        message: 'Authentication required',
        error: 'User authentication required',
      });
    }

    const {
      name,
      scopes,
      allowedEnvironments,
      allowedIpRanges,
      expiresInDays,
    } = req.body;

    // Validation
    if (!name || !scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return res.status(400).json({
        message: 'Validation error',
        error: 'Missing required fields: name, scopes (array)',
      });
    }

    // Validate scopes
    const validScopes = [
      'secrets:read',
      'secrets:write',
      'secrets:rotate',
      'integrations:sync',
      'audit:read',
    ];
    const invalidScopes = scopes.filter(scope => !validScopes.includes(scope));
    if (invalidScopes.length > 0) {
      return res.status(400).json({
        message: 'Validation error',
        error: `Invalid scopes: ${invalidScopes.join(', ')}`,
        validScopes,
      });
    }

    const serviceAccount = await createServiceAccount(
      req.user.id,
      name,
      scopes,
      allowedEnvironments,
      allowedIpRanges,
      expiresInDays
    );

    return res.status(201).json({
      success: true,
      data: serviceAccount,
    });
  } catch (error: any) {
    logger.error(`Error creating Service Account: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to create Service Account',
      error: error.message,
    });
  }
};

/**
 * List all Service Accounts for the authenticated user
 * 
 * @route GET /v/service-accounts
 * @access Protected (requires user JWT - UI only)
 */
export const listServiceAccountsController = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        message: 'Authentication required',
        error: 'User authentication required',
      });
    }

    const serviceAccounts = await listServiceAccounts(req.user.id);

    return res.status(200).json({
      success: true,
      data: serviceAccounts,
    });
  } catch (error: any) {
    logger.error(`Error listing Service Accounts: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to list Service Accounts',
      error: error.message,
    });
  }
};

/**
 * Get a single Service Account by ID
 * 
 * @route GET /v/service-accounts/:id
 * @access Protected (requires user JWT - UI only)
 */
export const getServiceAccountController = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        message: 'Authentication required',
        error: 'User authentication required',
      });
    }

    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Validation error',
        error: 'Invalid Service Account ID format',
      });
    }

    const serviceAccount = await getServiceAccountById(req.user.id, id);

    if (!serviceAccount) {
      return res.status(404).json({
        message: 'Service Account not found',
        error: 'The requested Service Account does not exist or you do not have access to it',
      });
    }

    return res.status(200).json({
      success: true,
      data: serviceAccount,
    });
  } catch (error: any) {
    logger.error(`Error getting Service Account: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to get Service Account',
      error: error.message,
    });
  }
};

/**
 * Revoke a Service Account
 * 
 * @route DELETE /v/service-accounts/:id
 * @access Protected (requires user JWT - UI only)
 */
export const revokeServiceAccountController = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        message: 'Authentication required',
        error: 'User authentication required',
      });
    }

    const { id } = req.params;
    const { reason } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Validation error',
        error: 'Invalid Service Account ID format',
      });
    }

    await revokeServiceAccount(req.user.id, id, reason);

    return res.status(200).json({
      success: true,
      message: 'Service Account revoked successfully',
    });
  } catch (error: any) {
    logger.error(`Error revoking Service Account: ${error.message}`);
    
    if (error.message.includes('not found') || error.message.includes('already revoked')) {
      return res.status(404).json({
        message: 'Service Account not found',
        error: error.message,
      });
    }

    return res.status(500).json({
      message: 'Failed to revoke Service Account',
      error: error.message,
    });
  }
};


