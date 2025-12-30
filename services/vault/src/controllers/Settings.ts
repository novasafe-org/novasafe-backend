import { Request, Response } from 'express';
import Database from '../../database/connection';
import { ISettings, DEFAULT_SETTINGS } from '../models/Settings';
import { addUserPermissionsToResponse } from '../utils/responseHelper';
import logger from '../logger';

const COLLECTION_NAME = 'user_settings';

/**
 * Get user settings
 * Returns user settings or default settings if not found
 */
export const getSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        message: 'Unauthorized',
        error: 'User ID not found in token'
      });
      return;
    }

    const db = new Database('vault');
    await db.connect();

    // Find user settings
    const settings = await db.findOne(COLLECTION_NAME, { userId });

    if (!settings) {
      // Return default settings if user settings don't exist
      const response = addUserPermissionsToResponse(req, {
        message: 'Settings retrieved successfully',
        data: {
          userId,
          ...DEFAULT_SETTINGS,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      });
      res.status(200).json(response);
      return;
    }

    const response = addUserPermissionsToResponse(req, {
      message: 'Settings retrieved successfully',
      data: settings
    });
    res.status(200).json(response);
  } catch (error: any) {
    logger.error(`Error getting settings: ${error.message}`);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Create new user settings
 * Creates settings with default values for a new user
 */
export const createSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        message: 'Unauthorized',
        error: 'User ID not found in token'
      });
      return;
    }

    const db = new Database('vault');
    await db.connect();

    // Check if settings already exist
    const existing = await db.findOne(COLLECTION_NAME, { userId });
    if (existing) {
      res.status(409).json({
        message: 'Settings already exist',
        error: 'Use PATCH to update existing settings'
      });
      return;
    }

    // Create new settings with defaults
    const newSettings: ISettings = {
      userId,
      ...DEFAULT_SETTINGS,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.insertOne(COLLECTION_NAME, newSettings);

    const response = addUserPermissionsToResponse(req, {
      message: 'Settings created successfully',
      data: {
        _id: result.insertedId,
        ...newSettings
      }
    });
    res.status(201).json(response);
  } catch (error: any) {
    logger.error(`Error creating settings: ${error.message}`);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Update user settings
 * Updates specific fields in user settings
 */
export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        message: 'Unauthorized',
        error: 'User ID not found in token'
      });
      return;
    }

    const updateData = req.body;

    // Remove userId and _id from update data (not allowed to update)
    delete updateData.userId;
    delete updateData._id;

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        message: 'Bad request',
        error: 'No fields to update'
      });
      return;
    }

    const db = new Database('vault');
    await db.connect();

    // Check if settings exist, create if not
    const existing = await db.findOne(COLLECTION_NAME, { userId });
    if (!existing) {
      // Create with defaults first
      const newSettings: ISettings = {
        userId,
        ...DEFAULT_SETTINGS,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insertOne(COLLECTION_NAME, newSettings);
    }

    // Update settings using MongoDB's findOneAndUpdate
    const dbConnection = db.getDb();
    const collection = dbConnection.collection(COLLECTION_NAME);
    const result = await collection.findOneAndUpdate(
      { userId },
      {
        $set: {
          ...updateData,
          updatedAt: new Date(),
        }
      },
      { returnDocument: 'after' }
    );

    if (!result || !result.value) {
      res.status(404).json({
        message: 'Settings not found',
        error: 'Could not update settings'
      });
      return;
    }

    const response = addUserPermissionsToResponse(req, {
      message: 'Settings updated successfully',
      data: result.value
    });
    res.status(200).json(response);
  } catch (error: any) {
    logger.error(`Error updating settings: ${error.message}`);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Reset user settings to defaults
 */
export const resetSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        message: 'Unauthorized',
        error: 'User ID not found in token'
      });
      return;
    }

    const db = new Database('vault');
    await db.connect();

    // Reset to defaults
    const resetData: ISettings = {
      userId,
      ...DEFAULT_SETTINGS,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Use MongoDB's findOneAndUpdate with upsert
    const dbConnection = db.getDb();
    const collection = dbConnection.collection(COLLECTION_NAME);
    const result = await collection.findOneAndUpdate(
      { userId },
      {
        $set: resetData
      },
      {
        upsert: true,
        returnDocument: 'after'
      }
    );

    const response = addUserPermissionsToResponse(req, {
      message: 'Settings reset successfully',
      data: result.value
    });
    res.status(200).json(response);
  } catch (error: any) {
    logger.error(`Error resetting settings: ${error.message}`);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Backup vault data
 * Simulated backup functionality
 */
export const backupVault = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        message: 'Unauthorized',
        error: 'User ID not found in token'
      });
      return;
    }

    // TODO: Implement actual backup logic
    // For now, return a success response
    const response = addUserPermissionsToResponse(req, {
      message: 'Vault backup initiated successfully',
      data: {
        backupId: `backup_${Date.now()}`,
        timestamp: new Date(),
        status: 'completed'
      }
    });
    res.status(200).json(response);
  } catch (error: any) {
    logger.error(`Error backing up vault: ${error.message}`);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Restore vault data
 * Simulated restore functionality
 */
export const restoreVault = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        message: 'Unauthorized',
        error: 'User ID not found in token'
      });
      return;
    }

    // TODO: Implement actual restore logic
    // For now, return a success response
    const response = addUserPermissionsToResponse(req, {
      message: 'Vault restore initiated successfully',
      data: {
        restoreId: `restore_${Date.now()}`,
        timestamp: new Date(),
        status: 'completed'
      }
    });
    res.status(200).json(response);
  } catch (error: any) {
    logger.error(`Error restoring vault: ${error.message}`);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

