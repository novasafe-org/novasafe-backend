/**
 * Share Controller
 * 
 * Handles HTTP requests for sharing vault items and folders.
 */

import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import {
  createShare,
  getSharesForRecipient,
  getSharesBySharer,
  revokeShare,
  updateSharePermission,
  getShareById,
  getUserPublicKey,
  saveUserPublicKey,
} from '../services/shareService';
import { DBCONFIG } from '../../config/config';
import logger from '../logger';
import '../middlewares/auth';

const collection = DBCONFIG.vault.collections;

/**
 * Create a new share
 * POST /v/share/create
 */
export const createShareController = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User information not found',
      });
      return;
    }

    const {
      recipientEmail,
      shareType,
      resourceId,
      permission,
      wrappedKey,
      wrappedKeyIV,
      message,
      integrityHash,
    } = req.body;

    // Validate required fields
    if (!recipientEmail || !shareType || !resourceId || !permission || !wrappedKey || !wrappedKeyIV) {
      res.status(400).json({
        message: 'Validation error',
        error: 'Missing required fields: recipientEmail, shareType, resourceId, permission, wrappedKey, wrappedKeyIV',
      });
      return;
    }

    if (!['item', 'folder'].includes(shareType)) {
      res.status(400).json({
        message: 'Validation error',
        error: 'shareType must be either "item" or "folder"',
      });
      return;
    }

    if (!['view', 'edit'].includes(permission)) {
      res.status(400).json({
        message: 'Validation error',
        error: 'permission must be either "view" or "edit"',
      });
      return;
    }

    // Find recipient by email
    const db = new Database('vault');
    const recipient = await db.findOne(collection.vaultUsers, {
      email: recipientEmail.toLowerCase().trim(),
    });

    if (!recipient) {
      res.status(404).json({
        message: 'Recipient not found',
        error: 'No user found with the provided email address',
      });
      return;
    }

    if (recipient._id.toString() === req.user.id) {
      res.status(400).json({
        message: 'Invalid operation',
        error: 'Cannot share with yourself',
      });
      return;
    }

    // Check if recipient has a public key
    const recipientKeys = await getUserPublicKey(recipient._id.toString());
    if (!recipientKeys) {
      res.status(400).json({
        message: 'Recipient not ready for sharing',
        error: 'The recipient has not set up sharing keys yet. Please ask them to enable sharing first.',
      });
      return;
    }

    // Validate wrapped key format (comprehensive validation)
    if (typeof wrappedKey !== 'string' || wrappedKey.trim().length === 0) {
      res.status(400).json({
        message: 'Validation error',
        error: 'wrappedKey must be a non-empty base64 string',
      });
      return;
    }

    if (typeof wrappedKeyIV !== 'string' || wrappedKeyIV.trim().length === 0) {
      res.status(400).json({
        message: 'Validation error',
        error: 'wrappedKeyIV must be a non-empty base64 string',
      });
      return;
    }

    // Validate base64 format and length
    try {
      // Check if wrappedKey is valid base64
      const wrappedKeyDecoded = Buffer.from(wrappedKey, 'base64');
      if (wrappedKeyDecoded.length === 0) {
        res.status(400).json({
          message: 'Validation error',
          error: 'wrappedKey is not valid base64 encoded data',
        });
        return;
      }

      // RSA-OAEP with 2048-bit key should produce ~256 bytes (344 base64 chars)
      // Allow some variance but check reasonable bounds
      if (wrappedKeyDecoded.length < 200 || wrappedKeyDecoded.length > 300) {
        logger.warn(`Wrapped key length is unusual: ${wrappedKeyDecoded.length} bytes (expected ~256 for RSA-OAEP 2048-bit)`);
      }

      // Validate wrappedKeyIV is valid base64 (should be 12 bytes = 16 base64 chars)
      const wrappedKeyIVDecoded = Buffer.from(wrappedKeyIV, 'base64');
      if (wrappedKeyIVDecoded.length === 0) {
        res.status(400).json({
          message: 'Validation error',
          error: 'wrappedKeyIV is not valid base64 encoded data',
        });
        return;
      }

      logger.info(`Share validation: wrappedKey length=${wrappedKeyDecoded.length} bytes, wrappedKeyIV length=${wrappedKeyIVDecoded.length} bytes`);
    } catch (error: any) {
      logger.error(`Invalid base64 format in wrapped key: ${error.message}`);
      res.status(400).json({
        message: 'Validation error',
        error: 'wrappedKey or wrappedKeyIV contains invalid base64 data',
        details: error.message,
      });
      return;
    }

    // Validate resourceId is a valid ObjectId
    if (!ObjectId.isValid(resourceId)) {
      res.status(400).json({
        message: 'Validation error',
        error: 'Invalid resource ID format',
      });
      return;
    }

    // Verify resource exists and belongs to sharer
    // Handle both ObjectId and string formats for userId/resourceId (backward compatibility)
    const resourceCollection = shareType === 'item' ? collection.vaultItems : collection.folders;

    const userIdFilters: any[] = [{ userId: req.user.id }];
    if (ObjectId.isValid(req.user.id)) {
      userIdFilters.push({ userId: new ObjectId(req.user.id) });
    }

    const resourceIdFilters: any[] = [{ id: resourceId }];
    if (ObjectId.isValid(resourceId)) {
      resourceIdFilters.push({ _id: new ObjectId(resourceId) });
    }

    const resourceQuery: any = {
      $and: [
        { $or: resourceIdFilters },
        { $or: userIdFilters },
      ],
    };

    if (shareType === 'item') {
      resourceQuery.$and.push({ deleted: { $ne: true } });
    }

    const resource = await db.findOne(resourceCollection, resourceQuery);

    if (!resource) {
      res.status(404).json({
        message: 'Resource not found',
        error: 'The item or folder you are trying to share does not exist or you do not have permission to share it',
      });
      return;
    }

    // Create share
    // Ensure resourceId is a valid ObjectId string
    const validResourceId = resourceId.toString().trim();
    
    // Store the recipient's key ID to track which key was used for wrapping
    // This helps detect if keys were rotated after sharing
    const recipientKeyId = recipientKeys._id?.toString() || null;
    
    const share = await createShare(
      req.user.id,
      recipient._id.toString(),
      shareType,
      validResourceId,
      permission,
      wrappedKey,
      wrappedKeyIV,
      message,
      integrityHash,
      recipientKeyId
    );

    logger.info(`Share created: ${share._id} by user ${req.user.email} for ${recipientEmail} using recipient key ${recipientKeyId}`);
    logger.debug(`Share details: resourceId=${validResourceId}, shareType=${shareType}, wrappedKey length=${wrappedKey.length}, wrappedKeyIV length=${wrappedKeyIV.length}`);

    res.status(201).json({
      message: 'Share created successfully',
      share: {
        id: share._id?.toString(),
        shareType: share.shareType,
        resourceId: share.resourceId,
        permission: share.permission,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        createdAt: share.createdAt,
      },
    });
  } catch (error: any) {
    logger.error(`Create share error: ${error.message}`);
    res.status(500).json({
      message: 'Failed to create share',
      error: error.message,
    });
  }
};

/**
 * Get shares for current user (as recipient)
 * GET /v/share/list?type=received
 */
export const getReceivedSharesController = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User information not found',
      });
      return;
    }

    const shares = await getSharesForRecipient(req.user.id);

    // Format response
    const formattedShares = shares.map((share: any) => {
      const formatted: any = {
        id: share._id?.toString(),
        shareType: share.shareType,
        resourceId: share.resourceId?.toString(),
        resourceName: share.resourceName || null,
        permission: share.permission,
        wrappedKey: share.wrappedKey,
        wrappedKeyIV: share.wrappedKeyIV,
        message: share.message,
        integrityHash: share.integrityHash,
        sharerEmail: share.sharerEmail,
        sharerName: share.sharerName,
        sharerPicture: share.sharerPicture,
        createdAt: share.createdAt,
        updatedAt: share.updatedAt,
        keyMismatch: share.keyMismatch || false, // Flag if recipient's key was rotated
        recipientKeyId: share.recipientKeyId || null, // Key ID used when share was created
      };

      // Include validation flags if available
      if (share.wrappedKeyValid !== undefined) {
        formatted.wrappedKeyValid = share.wrappedKeyValid;
      }
      if (share.wrappedKeyError) {
        formatted.wrappedKeyError = share.wrappedKeyError;
      }

      return formatted;
    });

    res.status(200).json({
      message: 'Shares retrieved successfully',
      shares: formattedShares,
      count: formattedShares.length,
    });
  } catch (error: any) {
    logger.error(`Get received shares error: ${error.message}`);
    res.status(500).json({
      message: 'Failed to retrieve shares',
      error: error.message,
    });
  }
};

/**
 * Get shares created by current user (as sharer)
 * GET /v/share/list?type=sent
 */
export const getSentSharesController = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User information not found',
      });
      return;
    }

    const shares = await getSharesBySharer(req.user.id);

    // Format response
    const formattedShares = shares.map((share: any) => ({
      id: share._id?.toString(),
      shareType: share.shareType,
      resourceId: share.resourceId?.toString(),
      resourceName: share.resourceName || null,
      permission: share.permission,
      message: share.message,
      recipientEmail: share.recipientEmail,
      recipientName: share.recipientName,
      recipientPicture: share.recipientPicture,
      createdAt: share.createdAt,
      updatedAt: share.updatedAt,
    }));

    res.status(200).json({
      message: 'Shares retrieved successfully',
      shares: formattedShares,
      count: formattedShares.length,
    });
  } catch (error: any) {
    logger.error(`Get sent shares error: ${error.message}`);
    res.status(500).json({
      message: 'Failed to retrieve shares',
      error: error.message,
    });
  }
};

/**
 * Revoke a share
 * POST /v/share/revoke
 */
export const revokeShareController = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User information not found',
      });
      return;
    }

    const { shareId } = req.body;

    if (!shareId) {
      res.status(400).json({
        message: 'Validation error',
        error: 'shareId is required',
      });
      return;
    }

    await revokeShare(shareId, req.user.id);

    logger.info(`Share ${shareId} revoked by user ${req.user.email}`);

    res.status(200).json({
      message: 'Share revoked successfully',
    });
  } catch (error: any) {
    logger.error(`Revoke share error: ${error.message}`);
    
    if (error.message.includes('Unauthorized') || error.message.includes('not found')) {
      res.status(403).json({
        message: 'Unauthorized',
        error: error.message,
      });
      return;
    }

    res.status(500).json({
      message: 'Failed to revoke share',
      error: error.message,
    });
  }
};

/**
 * Update share permissions
 * PATCH /v/share/update
 */
export const updateSharePermissionController = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User information not found',
      });
      return;
    }

    const { shareId, permission } = req.body;

    if (!shareId || !permission) {
      res.status(400).json({
        message: 'Validation error',
        error: 'shareId and permission are required',
      });
      return;
    }

    if (!['view', 'edit'].includes(permission)) {
      res.status(400).json({
        message: 'Validation error',
        error: 'permission must be either "view" or "edit"',
      });
      return;
    }

    await updateSharePermission(shareId, req.user.id, permission);

    logger.info(`Share ${shareId} permission updated to ${permission} by user ${req.user.email}`);

    res.status(200).json({
      message: 'Share permission updated successfully',
    });
  } catch (error: any) {
    logger.error(`Update share permission error: ${error.message}`);
    
    if (error.message.includes('Unauthorized') || error.message.includes('not found')) {
      res.status(403).json({
        message: 'Unauthorized',
        error: error.message,
      });
      return;
    }

    res.status(500).json({
      message: 'Failed to update share permission',
      error: error.message,
    });
  }
};

/**
 * Get user's public key by email or userId
 * GET /v/share/keys/public?email=user@example.com or ?userId=xxx
 */
export const getPublicKeyController = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User information not found',
      });
      return;
    }

    const { userId, email } = req.query;

    let targetUserId: string | undefined;

    // If email is provided, find user by email
    if (email) {
      let emailStr: string | undefined;
      if (typeof email === 'string') {
        emailStr = email;
      } else if (Array.isArray(email) && typeof email[0] === 'string') {
        emailStr = email[0];
      }

      if (emailStr) {
        const db = new Database('vault');
        const user = await db.findOne(collection.vaultUsers, {
          email: emailStr.toLowerCase().trim(),
        });

        if (!user) {
          res.status(404).json({
            message: 'User not found',
            error: 'No user found with the provided email address',
          });
          return;
        }

        targetUserId = user._id.toString();
      }
    } else if (userId) {
      // If userId is provided, get that user's public key (for sharing)
      // Otherwise, get current user's public key
      let userIdStr: string | undefined;
      if (typeof userId === 'string') {
        userIdStr = userId;
      } else if (Array.isArray(userId) && typeof userId[0] === 'string') {
        userIdStr = userId[0];
      }
      targetUserId = userIdStr && userIdStr !== req.user.id ? userIdStr : req.user.id;
    } else {
      // Default to current user
      targetUserId = req.user.id;
    }

    const userKeys = await getUserPublicKey(targetUserId);

    if (!userKeys) {
      res.status(404).json({
        message: 'Public key not found',
        error: 'User has not generated a public key yet',
      });
      return;
    }

    // Parse and normalize the public key JWK to ensure compatibility
    // Remove or normalize the 'alg' field to prevent import errors
    let normalizedPublicKey = userKeys.publicKey;
    try {
      // If publicKey is a JSON string, parse it
      const publicKeyJwk = typeof userKeys.publicKey === 'string' 
        ? JSON.parse(userKeys.publicKey) 
        : userKeys.publicKey;

      // Remove 'alg' field if present (let the client specify the algorithm)
      // Or set it to 'RSA-OAEP' to match what React Native expects
      if (publicKeyJwk && typeof publicKeyJwk === 'object') {
        // Remove conflicting alg field - client will specify during import
        delete publicKeyJwk.alg;
        // Ensure 'use' field is set correctly if needed
        if (!publicKeyJwk.use) {
          publicKeyJwk.use = 'enc';
        }
        // Re-stringify the normalized JWK
        normalizedPublicKey = JSON.stringify(publicKeyJwk);
      }
    } catch (error: any) {
      // If parsing fails, log warning but return original key
      logger.warn(`Failed to normalize public key for user ${targetUserId}: ${error.message}`);
      // Continue with original key
    }

    res.status(200).json({
      message: 'Public key retrieved successfully',
      publicKey: normalizedPublicKey,
      keyAlgorithm: userKeys.keyAlgorithm || 'RSA-OAEP',
      userId: userKeys.userId?.toString(),
    });
  } catch (error: any) {
    logger.error(`Get public key error: ${error.message}`);
    res.status(500).json({
      message: 'Failed to retrieve public key',
      error: error.message,
    });
  }
};

/**
 * Save user's public key
 * POST /v/share/keys/public
 */
export const savePublicKeyController = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User information not found',
      });
      return;
    }

    const { publicKey, keyAlgorithm } = req.body;

    if (!publicKey) {
      res.status(400).json({
        message: 'Validation error',
        error: 'publicKey is required',
      });
      return;
    }

    const userKeys = await saveUserPublicKey(
      req.user.id,
      publicKey,
      keyAlgorithm || 'RSA-OAEP'
    );

    logger.info(`Public key saved for user ${req.user.email}`);

    res.status(200).json({
      message: 'Public key saved successfully',
      keyId: userKeys._id?.toString(),
      keyAlgorithm: userKeys.keyAlgorithm,
    });
  } catch (error: any) {
    logger.error(`Save public key error: ${error.message}`);
    res.status(500).json({
      message: 'Failed to save public key',
      error: error.message,
    });
  }
};
