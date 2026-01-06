/**
 * Secrets Service
 * 
 * Business logic for managing secrets in the Secrets Manager.
 * Handles CRUD operations, versioning, rotation, and access tracking.
 */

import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { ISecret, ISecretVersion, ISecretAccess } from '../models/Secret';
import logger from '../logger';
import { activityLogService } from './activityLogService';

const collection = DBCONFIG.vault.collections;

/**
 * Create a new secret
 */
export const createSecret = async (
  userId: string,
  secretData: {
    name: string;
    description?: string;
    type: string;
    category: string;
    encrypted_data: string;
    iv: string;
    fields: Record<string, string>;
    tags?: string[];
    rotationEnabled?: boolean;
    rotationDays?: number;
    expiresAt?: string | null;
    integrationId?: string | null;
  }
): Promise<ISecret> => {
  try {
    const db = new Database('vault');

    const newSecret: Omit<ISecret, '_id'> = {
      userId: new ObjectId(userId),
      name: secretData.name,
      description: secretData.description,
      type: secretData.type,
      category: secretData.category,
      encrypted_data: secretData.encrypted_data,
      iv: secretData.iv,
      field_count: Object.keys(secretData.fields).length,
      tags: secretData.tags || [],
      rotationEnabled: secretData.rotationEnabled || false,
      rotationDays: secretData.rotationDays,
      expiresAt: secretData.expiresAt ? new Date(secretData.expiresAt) : null,
      integrationId: secretData.integrationId || null,
      version: 1,
      accessCount: 0,
      lastAccessedAt: null,
      isFavorite: false,
      createdBy: new ObjectId(userId),
      updatedBy: new ObjectId(userId),
      createdAt: new Date(),
      updatedAt: new Date(),
      deleted: false,
    };

    const result = await db.insertOne(collection.secrets, newSecret);
    const createdSecret = { ...newSecret, _id: result.insertedId } as ISecret;

    // Log activity (non-blocking)
    activityLogService.logEvent({
      organizationId: userId, // For individual users, use userId as organizationId
      actorUserId: userId,
      targetType: 'item', // Using 'item' as closest match for secrets
      targetId: result.insertedId.toString(),
      action: 'ITEM_CREATED',
      description: `Created secret: ${secretData.name}`,
      metadata: {
        type: secretData.type,
        category: secretData.category,
      },
    }).catch(err => logger.error(err, 'Failed to log secret creation activity'));

    logger.info(`Secret created: ${result.insertedId} by user ${userId}`);
    return createdSecret;
  } catch (error: any) {
    logger.error(`Error creating secret: ${error.message}`);
    throw error;
  }
};

/**
 * Get all secrets for a user with pagination support
 */
export const getSecrets = async (
  userId: string,
  filters?: {
    category?: string;
    type?: string;
    tags?: string[];
    search?: string;
    rotationEnabled?: boolean;
    expiresSoon?: boolean;
    isFavorite?: boolean;
    page?: number;
    limit?: number;
  }
): Promise<{ secrets: ISecret[]; total: number; page: number; limit: number; totalPages: number }> => {
  try {
    const db = new Database('vault');

    const query: any = {
      userId: new ObjectId(userId),
      deleted: { $ne: true },
    };

    // Apply filters
    if (filters?.category) {
      query.category = filters.category;
    }

    if (filters?.type) {
      query.type = filters.type;
    }

    if (filters?.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags };
    }

    if (filters?.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
      ];
    }

    if (filters?.rotationEnabled !== undefined) {
      query.rotationEnabled = filters.rotationEnabled;
    }

    if (filters?.expiresSoon) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      query.expiresAt = { $lte: thirtyDaysFromNow, $gte: new Date() };
    }

    if (filters?.isFavorite !== undefined) {
      query.isFavorite = filters.isFavorite;
    }

    // Pagination
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    // Get total count
    const mongoDb = db.getDb();
    const total = await mongoDb.collection(collection.secrets).countDocuments(query);

    // Get paginated secrets
    const secrets = await db.findMany(collection.secrets, query, {
      skip,
      limit,
      sort: { updatedAt: -1 }, // Sort by updatedAt descending
    }) as ISecret[];

    const totalPages = Math.ceil(total / limit);

    return {
      secrets,
      total,
      page,
      limit,
      totalPages,
    };
  } catch (error: any) {
    logger.error(`Error fetching secrets: ${error.message}`);
    throw error;
  }
};

/**
 * Get a single secret by ID
 */
export const getSecretById = async (
  userId: string,
  secretId: string
): Promise<ISecret | null> => {
  try {
    const db = new Database('vault');

    const secret = await db.findOne(collection.secrets, {
      _id: new ObjectId(secretId),
      userId: new ObjectId(userId),
      deleted: { $ne: true },
    }) as ISecret | null;

    return secret;
  } catch (error: any) {
    logger.error(`Error fetching secret: ${error.message}`);
    throw error;
  }
};

/**
 * Update a secret
 */
export const updateSecret = async (
  userId: string,
  secretId: string,
  updates: {
    name?: string;
    description?: string;
    type?: string;
    category?: string;
    encrypted_data?: string;
    iv?: string;
    fields?: Record<string, string>;
    tags?: string[];
    rotationEnabled?: boolean;
    rotationDays?: number;
    expiresAt?: string | null;
    integrationId?: string | null;
    isFavorite?: boolean;
  }
): Promise<ISecret | null> => {
  try {
    const db = new Database('vault');

    // Get current secret to check version
    const currentSecret = await db.findOne(collection.secrets, {
      _id: new ObjectId(secretId),
      userId: new ObjectId(userId),
      deleted: { $ne: true },
    }) as ISecret | null;

    if (!currentSecret) {
      return null;
    }

    // Create version history before updating
    if (updates.encrypted_data && updates.iv) {
      const versionData: Omit<ISecretVersion, '_id'> = {
        secretId: new ObjectId(secretId),
        userId: new ObjectId(userId),
        version: currentSecret.version || 1,
        encrypted_data: currentSecret.encrypted_data,
        iv: currentSecret.iv,
        createdAt: new Date(),
        createdBy: new ObjectId(userId),
      };

      await db.insertOne(collection.secretVersions, versionData).catch(err =>
        logger.error(err, 'Failed to create secret version')
      );
    }

    // Prepare update object
    const updateData: any = {
      updatedAt: new Date(),
      updatedBy: new ObjectId(userId),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.encrypted_data !== undefined) updateData.encrypted_data = updates.encrypted_data;
    if (updates.iv !== undefined) updateData.iv = updates.iv;
    if (updates.fields !== undefined) updateData.field_count = Object.keys(updates.fields).length;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.rotationEnabled !== undefined) updateData.rotationEnabled = updates.rotationEnabled;
    if (updates.rotationDays !== undefined) updateData.rotationDays = updates.rotationDays;
    if (updates.expiresAt !== undefined) {
      updateData.expiresAt = updates.expiresAt ? new Date(updates.expiresAt) : null;
    }
    if (updates.integrationId !== undefined) updateData.integrationId = updates.integrationId;
    if (updates.isFavorite !== undefined) updateData.isFavorite = updates.isFavorite;

    // Increment version if encrypted data changed
    if (updates.encrypted_data) {
      updateData.version = (currentSecret.version || 1) + 1;
    }

    const result = await db.updateOne(
      collection.secrets,
      {
        _id: new ObjectId(secretId),
        userId: new ObjectId(userId),
      },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return null;
    }

    // Log activity (non-blocking)
    activityLogService.logEvent({
      organizationId: userId,
      actorUserId: userId,
      targetType: 'item', // Using 'item' as closest match for secrets
      targetId: secretId,
      action: 'ITEM_UPDATED',
      description: `Updated secret: ${updates.name || currentSecret.name}`,
      metadata: {
        version: updateData.version || currentSecret.version,
      },
    }).catch(err => logger.error(err, 'Failed to log secret update activity'));

    const updatedSecret = await getSecretById(userId, secretId);
    return updatedSecret;
  } catch (error: any) {
    logger.error(`Error updating secret: ${error.message}`);
    throw error;
  }
};

/**
 * Delete a secret (soft delete)
 */
export const deleteSecret = async (
  userId: string,
  secretId: string
): Promise<boolean> => {
  try {
    const db = new Database('vault');

    const result = await db.updateOne(
      collection.secrets,
      {
        _id: new ObjectId(secretId),
        userId: new ObjectId(userId),
      },
      {
        $set: {
          deleted: true,
          updatedAt: new Date(),
          updatedBy: new ObjectId(userId),
        },
      }
    );

    if (result.modifiedCount === 0) {
      return false;
    }

    // Log activity (non-blocking)
    activityLogService.logEvent({
      organizationId: userId,
      actorUserId: userId,
      targetType: 'item', // Using 'item' as closest match for secrets
      targetId: secretId,
      action: 'ITEM_DELETED',
      description: 'Deleted secret',
    }).catch(err => logger.error(err, 'Failed to log secret deletion activity'));

    logger.info(`Secret deleted: ${secretId} by user ${userId}`);
    return true;
  } catch (error: any) {
    logger.error(`Error deleting secret: ${error.message}`);
    throw error;
  }
};

/**
 * Track secret access
 */
export const trackSecretAccess = async (
  userId: string,
  secretId: string,
  action: 'view' | 'copy' | 'update' | 'delete' | 'rotate',
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  try {
    const db = new Database('vault');

    // Update access count and last accessed time
    await db.updateOne(
      collection.secrets,
      {
        _id: new ObjectId(secretId),
        userId: new ObjectId(userId),
      },
      {
        $inc: { accessCount: 1 },
        $set: { lastAccessedAt: new Date() },
      }
    );

    // Create access log entry
    const accessLog: Omit<ISecretAccess, '_id'> = {
      secretId: new ObjectId(secretId),
      userId: new ObjectId(userId),
      action,
      ipAddress,
      userAgent,
      accessedAt: new Date(),
    };

    await db.insertOne(collection.secretAccessLogs, accessLog).catch(err =>
      logger.error(err, 'Failed to create secret access log')
    );
  } catch (error: any) {
    logger.error(`Error tracking secret access: ${error.message}`);
    // Don't throw - access tracking is non-critical
  }
};

/**
 * Rotate a secret
 */
export const rotateSecret = async (
  userId: string,
  secretId: string,
  newEncryptedData: string,
  newIv: string
): Promise<ISecret | null> => {
  try {
    const secret = await updateSecret(userId, secretId, {
      encrypted_data: newEncryptedData,
      iv: newIv,
    });

    if (secret) {
      // Update rotation timestamp
      const db = new Database('vault');
      await db.updateOne(
        collection.secrets,
        { _id: new ObjectId(secretId) },
        { $set: { lastRotatedAt: new Date() } }
      );

      // Track rotation
      await trackSecretAccess(userId, secretId, 'rotate');

      // Log activity (non-blocking)
      activityLogService.logEvent({
        organizationId: userId,
        actorUserId: userId,
        targetType: 'item', // Using 'item' as closest match for secrets
        targetId: secretId,
        action: 'ITEM_UPDATED',
        description: 'Rotated secret',
        metadata: { rotation: true },
      }).catch(err => logger.error(err, 'Failed to log secret rotation activity'));
    }

    return secret;
  } catch (error: any) {
    logger.error(`Error rotating secret: ${error.message}`);
    throw error;
  }
};

/**
 * Get secret versions
 */
export const getSecretVersions = async (
  userId: string,
  secretId: string
): Promise<ISecretVersion[]> => {
  try {
    const db = new Database('vault');

    const versions = await db.findMany(collection.secretVersions, {
      secretId: new ObjectId(secretId),
      userId: new ObjectId(userId),
    }) as ISecretVersion[];
    // Sort by version descending
    versions.sort((a, b) => b.version - a.version);

    return versions;
  } catch (error: any) {
    logger.error(`Error fetching secret versions: ${error.message}`);
    throw error;
  }
};

