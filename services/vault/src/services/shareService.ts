/**
 * Share Service
 * 
 * Handles sharing operations for vault items and folders.
 * Manages share creation, listing, revocation, and permission updates.
 */

import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import { IShare, ShareType, SharePermission } from '../models/Share';
import { IUserKeys } from '../models/UserKeys';
import { DBCONFIG } from '../../config/config';
import logger from '../logger';

const collection = DBCONFIG.vault.collections;

/**
 * Create a new share
 */
export const createShare = async (
  sharerId: string,
  recipientId: string,
  shareType: ShareType,
  resourceId: string,
  permission: SharePermission,
  wrappedKey: string,
  wrappedKeyIV: string,
  message?: string,
  integrityHash?: string,
  recipientKeyId?: string | null
): Promise<IShare> => {
  try {
    // Validate ObjectIds
    if (!ObjectId.isValid(sharerId)) {
      throw new Error('Invalid sharer ID format');
    }
    if (!ObjectId.isValid(recipientId)) {
      throw new Error('Invalid recipient ID format');
    }
    if (!ObjectId.isValid(resourceId)) {
      throw new Error('Invalid resource ID format');
    }

    const db = new Database('vault');
    
    // Check if share already exists
    const existingShare = await db.findOne(collection.shares, {
      sharerId: new ObjectId(sharerId),
      recipientId: new ObjectId(recipientId),
      resourceId: new ObjectId(resourceId),
      shareType,
      active: true,
    });

    if (existingShare) {
      // Update existing share
      const updatedShare: any = {
        permission,
        wrappedKey,
        wrappedKeyIV,
        message,
        integrityHash,
        updatedAt: new Date().toISOString(),
        active: true,
        revokedAt: null,
      };

      // Update recipient key ID if provided
      if (recipientKeyId) {
        updatedShare.recipientKeyId = new ObjectId(recipientKeyId);
      }

      await db.updateOne(
        collection.shares,
        { _id: existingShare._id },
        { $set: updatedShare }
      );

      return {
        ...existingShare,
        ...updatedShare,
      } as IShare;
    }

    // Create new share
    const newShare: IShare = {
      sharerId: new ObjectId(sharerId),
      recipientId: new ObjectId(recipientId),
      shareType,
      resourceId: new ObjectId(resourceId),
      permission,
      wrappedKey,
      wrappedKeyIV,
      message,
      integrityHash,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store recipient key ID if provided
    if (recipientKeyId) {
      newShare.recipientKeyId = new ObjectId(recipientKeyId);
    }

    const result = await db.insertOne(collection.shares, newShare);

    // Verify the share was stored correctly by reading it back
    const storedShare = await db.findOne(collection.shares, {
      _id: result.insertedId,
    });

    if (!storedShare) {
      throw new Error('Failed to verify share was stored correctly');
    }

    // Verify wrapped key was stored correctly
    if (storedShare.wrappedKey !== wrappedKey) {
      logger.error(`Wrapped key mismatch after storage! Original length: ${wrappedKey.length}, Stored length: ${storedShare.wrappedKey?.length || 0}`);
      throw new Error('Wrapped key was corrupted during storage');
    }

    logger.info(`Share stored and verified: ${result.insertedId}, wrappedKey length: ${wrappedKey.length}`);

    return {
      ...newShare,
      _id: result.insertedId,
    } as IShare;
  } catch (error: any) {
    logger.error(`Error creating share: ${error.message}`);
    throw error;
  }
};

/**
 * Get all shares for a user (as recipient)
 */
export const getSharesForRecipient = async (recipientId: string): Promise<IShare[]> => {
  try {
    const db = new Database('vault');
    const shares = await db.findMany(collection.shares, {
      recipientId: new ObjectId(recipientId),
      active: true,
    });

    // Populate sharer information and resource names
    // Also check if recipient's key has changed (key rotation detection)
    const recipientCurrentKeys = await getUserPublicKey(recipientId);
    const recipientCurrentKeyId = recipientCurrentKeys?._id?.toString() || null;

    const sharesWithSharer = await Promise.all(
      shares.map(async (share: any) => {
        const sharer = await db.findOne(collection.vaultUsers, {
          _id: new ObjectId(share.sharerId),
        });
        
        // Fetch resource name (folder name or item title)
        let resourceName = null;
        if (share.shareType === 'folder') {
          const folder = await db.findOne(collection.folders, {
            _id: new ObjectId(share.resourceId),
          });
          resourceName = folder?.name || null;
        } else {
          const item = await db.findOne(collection.vaultItems, {
            $or: [
              { _id: new ObjectId(share.resourceId) },
              { id: share.resourceId }
            ],
          });
          resourceName = item?.title || null;
        }
        
        // Check if recipient's key has changed since share was created
        const shareKeyId = share.recipientKeyId?.toString() || null;
        const keyMismatch = shareKeyId && recipientCurrentKeyId && shareKeyId !== recipientCurrentKeyId;
        
        // Validate wrapped key format before returning
        let wrappedKeyValid = true;
        let wrappedKeyError = null;
        if (share.wrappedKey) {
          try {
            const decoded = Buffer.from(share.wrappedKey, 'base64');
            if (decoded.length === 0) {
              wrappedKeyValid = false;
              wrappedKeyError = 'Invalid base64 format - decoded length is 0';
            } else if (decoded.length < 200 || decoded.length > 300) {
              // RSA-OAEP with 2048-bit key should be ~256 bytes
              logger.warn(`Share ${share._id?.toString()} wrappedKey has unusual length: ${decoded.length} bytes (expected ~256)`);
            }
          } catch (error: any) {
            wrappedKeyValid = false;
            wrappedKeyError = `Base64 decode error: ${error.message}`;
            logger.error(`Share ${share._id?.toString()} has invalid wrappedKey format: ${wrappedKeyError}`);
          }
        } else {
          wrappedKeyValid = false;
          wrappedKeyError = 'wrappedKey is missing';
          logger.error(`Share ${share._id?.toString()} is missing wrappedKey`);
        }
        
        return {
          ...share,
          sharerEmail: sharer?.email || null,
          sharerName: sharer?.name || null,
          sharerPicture: sharer?.picture || null,
          resourceName,
          keyMismatch, // Flag indicating if key was rotated after share was created
          recipientKeyId: shareKeyId, // The key ID used when share was created
          wrappedKeyValid, // Flag indicating if wrapped key format is valid
          wrappedKeyError, // Error message if wrapped key is invalid
        };
      })
    );

    return sharesWithSharer;
  } catch (error: any) {
    logger.error(`Error fetching shares for recipient: ${error.message}`);
    throw error;
  }
};

/**
 * Get all shares created by a user (as sharer)
 */
export const getSharesBySharer = async (sharerId: string): Promise<IShare[]> => {
  try {
    const db = new Database('vault');
    const shares = await db.findMany(collection.shares, {
      sharerId: new ObjectId(sharerId),
      active: true,
    });

    // Populate recipient information and resource names
    const sharesWithRecipient = await Promise.all(
      shares.map(async (share: any) => {
        const recipient = await db.findOne(collection.vaultUsers, {
          _id: new ObjectId(share.recipientId),
        });
        
        // Fetch resource name (folder name or item title)
        let resourceName = null;
        if (share.shareType === 'folder') {
          const folder = await db.findOne(collection.folders, {
            _id: new ObjectId(share.resourceId),
          });
          resourceName = folder?.name || null;
        } else {
          const item = await db.findOne(collection.vaultItems, {
            $or: [
              { _id: new ObjectId(share.resourceId) },
              { id: share.resourceId }
            ],
          });
          resourceName = item?.title || null;
        }
        
        return {
          ...share,
          recipientEmail: recipient?.email || null,
          recipientName: recipient?.name || null,
          recipientPicture: recipient?.picture || null,
          resourceName,
        };
      })
    );

    return sharesWithRecipient;
  } catch (error: any) {
    logger.error(`Error fetching shares by sharer: ${error.message}`);
    throw error;
  }
};

/**
 * Revoke a share
 */
export const revokeShare = async (
  shareId: string,
  userId: string
): Promise<void> => {
  try {
    const db = new Database('vault');
    
    // Verify user owns the share (either as sharer or recipient)
    const share = await db.findOne(collection.shares, {
      _id: new ObjectId(shareId),
    });

    if (!share) {
      throw new Error('Share not found');
    }

    // Only sharer can revoke
    if (share.sharerId.toString() !== userId) {
      throw new Error('Unauthorized: Only the sharer can revoke a share');
    }

    await db.updateOne(
      collection.shares,
      { _id: new ObjectId(shareId) },
      {
        $set: {
          active: false,
          revokedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }
    );

    logger.info(`Share ${shareId} revoked by user ${userId}`);
  } catch (error: any) {
    logger.error(`Error revoking share: ${error.message}`);
    throw error;
  }
};

/**
 * Update share permissions
 */
export const updateSharePermission = async (
  shareId: string,
  userId: string,
  permission: SharePermission
): Promise<void> => {
  try {
    const db = new Database('vault');
    
    // Verify user owns the share (as sharer)
    const share = await db.findOne(collection.shares, {
      _id: new ObjectId(shareId),
    });

    if (!share) {
      throw new Error('Share not found');
    }

    if (share.sharerId.toString() !== userId) {
      throw new Error('Unauthorized: Only the sharer can update permissions');
    }

    await db.updateOne(
      collection.shares,
      { _id: new ObjectId(shareId) },
      {
        $set: {
          permission,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    logger.info(`Share ${shareId} permission updated to ${permission} by user ${userId}`);
  } catch (error: any) {
    logger.error(`Error updating share permission: ${error.message}`);
    throw error;
  }
};

/**
 * Get a specific share by ID
 */
export const getShareById = async (
  shareId: string,
  userId: string
): Promise<IShare | null> => {
  try {
    const db = new Database('vault');
    const share = await db.findOne(collection.shares, {
      _id: new ObjectId(shareId),
      active: true,
    });

    if (!share) {
      return null;
    }

    // Verify user has access (either as sharer or recipient)
    if (
      share.sharerId.toString() !== userId &&
      share.recipientId.toString() !== userId
    ) {
      throw new Error('Unauthorized: You do not have access to this share');
    }

    return share as IShare;
  } catch (error: any) {
    logger.error(`Error fetching share: ${error.message}`);
    throw error;
  }
};

/**
 * Get user's public key for key wrapping
 */
export const getUserPublicKey = async (userId: string): Promise<IUserKeys | null> => {
  try {
    const db = new Database('vault');
    const userKeys = await db.findOne(collection.userKeys, {
      userId: new ObjectId(userId),
      active: true,
    });

    return userKeys as IUserKeys | null;
  } catch (error: any) {
    logger.error(`Error fetching user public key: ${error.message}`);
    throw error;
  }
};

/**
 * Save or update user's public key
 */
export const saveUserPublicKey = async (
  userId: string,
  publicKey: string,
  keyAlgorithm: string = 'RSA-OAEP'
): Promise<IUserKeys> => {
  try {
    const db = new Database('vault');
    
    // Check if keys exist
    const existingKeys = await db.findOne(collection.userKeys, {
      userId: new ObjectId(userId),
    });

    if (existingKeys) {
      // Update existing keys
      await db.updateOne(
        collection.userKeys,
        { userId: new ObjectId(userId) },
        {
          $set: {
            publicKey,
            keyAlgorithm,
            updatedAt: new Date().toISOString(),
            active: true,
          },
        }
      );

      return {
        ...existingKeys,
        publicKey,
        keyAlgorithm,
        updatedAt: new Date().toISOString(),
        active: true,
      } as IUserKeys;
    }

    // Create new keys
    const newKeys: IUserKeys = {
      userId: new ObjectId(userId),
      publicKey,
      keyAlgorithm,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      active: true,
    };

    const result = await db.insertOne(collection.userKeys, newKeys);

    return {
      ...newKeys,
      _id: result.insertedId,
    } as IUserKeys;
  } catch (error: any) {
    logger.error(`Error saving user public key: ${error.message}`);
    throw error;
  }
};

