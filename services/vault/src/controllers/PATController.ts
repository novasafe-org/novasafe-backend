/**
 * Personal Access Token Controller
 * 
 * API endpoints for managing Personal Access Tokens (PATs).
 * PATs are used for machine-to-machine API access.
 */

import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import logger from '../logger';
import {
  createPAT,
  listPATs,
  revokePAT,
  getPATById,
} from '../services/patService';
import '../middlewares/auth'; // Extend Express Request type

/**
 * Create a new Personal Access Token
 * 
 * @route POST /v/pats
 * @access Protected (requires user JWT - UI only)
 */
export const createPATController = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        message: 'Authentication required',
        error: 'User authentication required',
      });
    }

    const { name, scopes, expiresInDays } = req.body;

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

    const pat = await createPAT(
      req.user.id,
      name,
      scopes,
      expiresInDays
    );

    return res.status(201).json({
      success: true,
      data: pat,
    });
  } catch (error: any) {
    logger.error(`Error creating PAT: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to create PAT',
      error: error.message,
    });
  }
};

/**
 * List all PATs for the authenticated user
 * 
 * @route GET /v/pats
 * @access Protected (requires user JWT - UI only)
 */
export const listPATsController = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        message: 'Authentication required',
        error: 'User authentication required',
      });
    }

    const pats = await listPATs(req.user.id);

    return res.status(200).json({
      success: true,
      data: pats,
    });
  } catch (error: any) {
    logger.error(`Error listing PATs: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to list PATs',
      error: error.message,
    });
  }
};

/**
 * Get a single PAT by ID
 * 
 * @route GET /v/pats/:id
 * @access Protected (requires user JWT - UI only)
 */
export const getPATController = async (req: Request, res: Response) => {
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
        error: 'Invalid PAT ID format',
      });
    }

    const pat = await getPATById(req.user.id, id);

    if (!pat) {
      return res.status(404).json({
        message: 'PAT not found',
        error: 'The requested PAT does not exist or you do not have access to it',
      });
    }

    return res.status(200).json({
      success: true,
      data: pat,
    });
  } catch (error: any) {
    logger.error(`Error getting PAT: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to get PAT',
      error: error.message,
    });
  }
};

/**
 * Revoke a PAT
 * 
 * @route DELETE /v/pats/:id
 * @access Protected (requires user JWT - UI only)
 */
export const revokePATController = async (req: Request, res: Response) => {
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
        error: 'Invalid PAT ID format',
      });
    }

    await revokePAT(req.user.id, id, reason);

    return res.status(200).json({
      success: true,
      message: 'PAT revoked successfully',
    });
  } catch (error: any) {
    logger.error(`Error revoking PAT: ${error.message}`);
    
    if (error.message.includes('not found') || error.message.includes('already revoked')) {
      return res.status(404).json({
        message: 'PAT not found',
        error: error.message,
      });
    }

    return res.status(500).json({
      message: 'Failed to revoke PAT',
      error: error.message,
    });
  }
};


