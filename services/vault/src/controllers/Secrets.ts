/**
 * Secrets Controller
 * 
 * API endpoints for managing secrets in the Secrets Manager.
 * All endpoints require authentication and proper permissions.
 */

import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import logger from '../logger';
import { addUserPermissionsToResponse } from '../utils/responseHelper';
import {
  createSecret,
  getSecrets,
  getSecretById,
  updateSecret,
  deleteSecret,
  trackSecretAccess,
  rotateSecret,
  getSecretVersions,
} from '../services/secretsService';
import '../middlewares/auth'; // Extend Express Request type
import '../middlewares/machineAuth'; // Extend Express Request type for machineAuth

/**
 * Create a new secret
 * 
 * @route POST /v/secrets
 * @access Protected (requires JWT and secrets:create permission)
 */
export const createSecretController = async (req: Request, res: Response) => {
  try {
    // Support both user JWT (UI) and machine auth (API)
    const userId = req.machineAuth?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        message: 'Authentication required',
        error: 'Authentication required',
      });
    }

    const {
      name,
      description,
      type,
      category,
      encrypted_data,
      iv,
      fields,
      tags,
      rotationEnabled,
      rotationDays,
      expiresAt,
      integrationId,
    } = req.body;

    // Validation
    if (!name || !type || !category || !encrypted_data || !iv) {
      return res.status(400).json({
        message: 'Validation error',
        error: 'Missing required fields: name, type, category, encrypted_data, iv',
      });
    }

    const secret = await createSecret(userId, {
      name,
      description,
      type,
      category,
      encrypted_data,
      iv,
      fields: fields || {},
      tags,
      rotationEnabled,
      rotationDays,
      expiresAt: expiresAt || null,
      integrationId: integrationId || null,
    });

    const response = {
      success: true,
      data: {
        id: secret._id?.toString(),
        name: secret.name,
        description: secret.description,
        type: secret.type,
        category: secret.category,
        tags: secret.tags,
        rotationEnabled: secret.rotationEnabled,
        rotationDays: secret.rotationDays,
        expiresAt: secret.expiresAt,
        version: secret.version,
        isFavorite: secret.isFavorite,
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
      },
    };

    return res.status(201).json(addUserPermissionsToResponse(req, response));
  } catch (error: any) {
    logger.error(`Error creating secret: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to create secret',
      error: error.message,
    });
  }
};

/**
 * Get all secrets for the authenticated user
 * 
 * @route GET /v/secrets
 * @access Protected (requires JWT and secrets:read permission)
 */
export const getSecretsController = async (req: Request, res: Response) => {
  try {
    // Support both user JWT (UI) and machine auth (API)
    const userId = req.machineAuth?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        message: 'Authentication required',
        error: 'Authentication required',
      });
    }

    const filters: any = {};
    
    if (req.query.category) filters.category = req.query.category;
    if (req.query.type) filters.type = req.query.type;
    if (req.query.tags) {
      filters.tags = Array.isArray(req.query.tags)
        ? req.query.tags
        : [req.query.tags];
    }
    if (req.query.search) filters.search = req.query.search as string;
    if (req.query.rotationEnabled !== undefined) {
      filters.rotationEnabled = req.query.rotationEnabled === 'true';
    }
    if (req.query.expiresSoon !== undefined) {
      filters.expiresSoon = req.query.expiresSoon === 'true';
    }
    if (req.query.isFavorite !== undefined) {
      filters.isFavorite = req.query.isFavorite === 'true';
    }

    // Pagination parameters
    if (req.query.page) {
      filters.page = parseInt(req.query.page as string, 10);
    }
    if (req.query.limit) {
      filters.limit = parseInt(req.query.limit as string, 10);
    }

    const result = await getSecrets(userId, filters);

    const formattedSecrets = result.secrets.map(secret => ({
      id: secret._id?.toString(),
      name: secret.name,
      description: secret.description,
      type: secret.type,
      category: secret.category,
      tags: secret.tags,
      rotationEnabled: secret.rotationEnabled,
      rotationDays: secret.rotationDays,
      expiresAt: secret.expiresAt,
      lastRotatedAt: secret.lastRotatedAt,
      version: secret.version,
      isFavorite: secret.isFavorite,
      accessCount: secret.accessCount,
      lastAccessedAt: secret.lastAccessedAt,
      integrationId: secret.integrationId,
      encrypted_data: secret.encrypted_data, // Include encrypted data for client-side decryption
      iv: secret.iv, // Include IV for client-side decryption
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
    }));

    const response = {
      success: true,
      data: formattedSecrets,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };

    return res.status(200).json(addUserPermissionsToResponse(req, response));
  } catch (error: any) {
    logger.error(`Error fetching secrets: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to fetch secrets',
      error: error.message,
    });
  }
};

/**
 * Get a single secret by ID
 * 
 * @route GET /v/secrets/:id
 * @access Protected (requires JWT and secrets:read permission)
 */
export const getSecretController = async (req: Request, res: Response) => {
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

    const secret = await getSecretById(userId, id);

    if (!secret) {
      return res.status(404).json({
        message: 'Secret not found',
        error: 'The requested secret does not exist or you do not have access to it',
      });
    }

    // Track access
    await trackSecretAccess(
      userId,
      id,
      'view',
      req.ip,
      req.get('user-agent')
    ).catch(err => logger.error(`Failed to track secret access: ${err.message}`));

    const response = {
      success: true,
      data: {
        id: secret._id?.toString(),
        name: secret.name,
        description: secret.description,
        type: secret.type,
        category: secret.category,
        encrypted_data: secret.encrypted_data,
        iv: secret.iv,
        tags: secret.tags,
        rotationEnabled: secret.rotationEnabled,
        rotationDays: secret.rotationDays,
        expiresAt: secret.expiresAt,
        lastRotatedAt: secret.lastRotatedAt,
        version: secret.version,
        isFavorite: secret.isFavorite,
        accessCount: secret.accessCount,
        lastAccessedAt: secret.lastAccessedAt,
        integrationId: secret.integrationId,
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
      },
    };

    return res.status(200).json(addUserPermissionsToResponse(req, response));
  } catch (error: any) {
    logger.error(`Error fetching secret: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to fetch secret',
      error: error.message,
    });
  }
};

/**
 * Update a secret
 * 
 * @route PUT /v/secrets/:id
 * @access Protected (requires JWT and secrets:update permission)
 */
export const updateSecretController = async (req: Request, res: Response) => {
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

    const {
      name,
      description,
      type,
      category,
      encrypted_data,
      iv,
      fields,
      tags,
      rotationEnabled,
      rotationDays,
      expiresAt,
      integrationId,
      isFavorite,
    } = req.body;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (type !== undefined) updates.type = type;
    if (category !== undefined) updates.category = category;
    if (encrypted_data !== undefined) updates.encrypted_data = encrypted_data;
    if (iv !== undefined) updates.iv = iv;
    if (fields !== undefined) updates.fields = fields;
    if (tags !== undefined) updates.tags = tags;
    if (rotationEnabled !== undefined) updates.rotationEnabled = rotationEnabled;
    if (rotationDays !== undefined) updates.rotationDays = rotationDays;
    if (expiresAt !== undefined) updates.expiresAt = expiresAt;
    if (integrationId !== undefined) updates.integrationId = integrationId;
    if (isFavorite !== undefined) updates.isFavorite = isFavorite;

    const secret = await updateSecret(userId, id, updates);

    if (!secret) {
      return res.status(404).json({
        message: 'Secret not found',
        error: 'The requested secret does not exist or you do not have access to it',
      });
    }

    // Track access
    await trackSecretAccess(
      userId,
      id,
      'update',
      req.ip,
      req.get('user-agent')
    ).catch(err => logger.error(`Failed to track secret access: ${err.message}`));

    const response = {
      success: true,
      data: {
        id: secret._id?.toString(),
        name: secret.name,
        description: secret.description,
        type: secret.type,
        category: secret.category,
        tags: secret.tags,
        rotationEnabled: secret.rotationEnabled,
        rotationDays: secret.rotationDays,
        expiresAt: secret.expiresAt,
        lastRotatedAt: secret.lastRotatedAt,
        version: secret.version,
        isFavorite: secret.isFavorite,
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
      },
    };

    return res.status(200).json(addUserPermissionsToResponse(req, response));
  } catch (error: any) {
    logger.error(`Error updating secret: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to update secret',
      error: error.message,
    });
  }
};

/**
 * Delete a secret (soft delete)
 * 
 * @route DELETE /v/secrets/:id
 * @access Protected (requires JWT and secrets:delete permission)
 */
export const deleteSecretController = async (req: Request, res: Response) => {
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

    const deleted = await deleteSecret(userId, id);

    if (!deleted) {
      return res.status(404).json({
        message: 'Secret not found',
        error: 'The requested secret does not exist or you do not have access to it',
      });
    }

    // Track access
    await trackSecretAccess(
      userId,
      id,
      'delete',
      req.ip,
      req.get('user-agent')
    ).catch(err => logger.error(`Failed to track secret access: ${err.message}`));

    return res.status(200).json(addUserPermissionsToResponse(req, {
      success: true,
      message: 'Secret deleted successfully',
    }));
  } catch (error: any) {
    logger.error(`Error deleting secret: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to delete secret',
      error: error.message,
    });
  }
};

/**
 * Track secret access
 * 
 * @route POST /v/secrets/:id/trackAccess
 * @access Protected (requires JWT)
 */
export const trackSecretAccessController = async (req: Request, res: Response) => {
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
    const { action } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Validation error',
        error: 'Invalid secret ID format',
      });
    }

    const validActions = ['view', 'copy', 'update', 'delete', 'rotate'];
    if (!action || !validActions.includes(action)) {
      return res.status(400).json({
        message: 'Validation error',
        error: `Invalid action. Must be one of: ${validActions.join(', ')}`,
      });
    }

    await trackSecretAccess(
      userId,
      id,
      action as 'view' | 'copy' | 'update' | 'delete' | 'rotate',
      req.ip,
      req.get('user-agent')
    );

    return res.status(200).json({
      success: true,
      message: 'Access tracked successfully',
    });
  } catch (error: any) {
    logger.error(`Error tracking secret access: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to track access',
      error: error.message,
    });
  }
};

/**
 * Rotate a secret
 * 
 * @route POST /v/secrets/:id/rotate
 * @access Protected (requires JWT and secrets:update permission)
 */
export const rotateSecretController = async (req: Request, res: Response) => {
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
    const { encrypted_data, iv } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Validation error',
        error: 'Invalid secret ID format',
      });
    }

    if (!encrypted_data || !iv) {
      return res.status(400).json({
        message: 'Validation error',
        error: 'Missing required fields: encrypted_data, iv',
      });
    }

    const secret = await rotateSecret(userId, id, encrypted_data, iv);

    if (!secret) {
      return res.status(404).json({
        message: 'Secret not found',
        error: 'The requested secret does not exist or you do not have access to it',
      });
    }

    const response = {
      success: true,
      data: {
        id: secret._id?.toString(),
        name: secret.name,
        version: secret.version,
        lastRotatedAt: secret.lastRotatedAt,
        updatedAt: secret.updatedAt,
      },
    };

    return res.status(200).json(addUserPermissionsToResponse(req, response));
  } catch (error: any) {
    logger.error(`Error rotating secret: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to rotate secret',
      error: error.message,
    });
  }
};

/**
 * Get secret versions
 * 
 * @route GET /v/secrets/:id/versions
 * @access Protected (requires JWT and secrets:read permission)
 */
export const getSecretVersionsController = async (req: Request, res: Response) => {
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

    const versions = await getSecretVersions(userId, id);

    const formattedVersions = versions.map(version => ({
      id: version._id?.toString(),
      secretId: version.secretId.toString(),
      version: version.version,
      createdAt: version.createdAt,
      createdBy: version.createdBy?.toString(),
    }));

    const response = {
      success: true,
      data: formattedVersions,
    };

    return res.status(200).json(addUserPermissionsToResponse(req, response));
  } catch (error: any) {
    logger.error(`Error fetching secret versions: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to fetch secret versions',
      error: error.message,
    });
  }
};

