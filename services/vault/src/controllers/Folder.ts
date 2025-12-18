import { Request, Response } from 'express';
import { DBCONFIG } from '../../config/config';
import Database from '../../database/connection';
import { ObjectId } from 'mongodb';
import logger from '../logger';
import { IFolder } from '../models/Folder';

const collection = DBCONFIG.vault.collections;

/**
 * Create Folder Controller
 * 
 * Creates a new folder and links it to the authenticated user.
 * 
 * @route POST /v/folders/create
 * @access Protected (requires JWT)
 */
export const createFolder = async (req: Request, res: Response) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User information not found'
      });
      return;
    }

    // Validate required fields
    if (!req.body.name || typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
      res.status(400).json({
        message: 'Validation error',
        error: 'Folder name is required and must be a non-empty string'
      });
      return;
    }

    // Create new folder with userId from authenticated user
    const newFolder: IFolder = {
      userId: req.user.id,
      name: req.body.name.trim(),
      description: req.body.description?.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accessCount: 0
    };

    // Save to database
    const db = new Database('vault');
    const result = await db.insertOne(collection.folders, newFolder);

    logger.info(`Folder created by user ${req.user.email}: ${newFolder.name}`);

    // Return created folder with _id
    res.status(201).json({
      folder: {
        id: result.insertedId.toString(),
        ...newFolder,
        _id: result.insertedId
      }
    });
  } catch (error: any) {
    logger.error(error, 'Error creating folder');
    res.status(500).json({
      message: 'Failed to create folder',
      error: error.message
    });
  }
};

/**
 * Get All Folders Controller
 * 
 * Retrieves all folders belonging to the authenticated user.
 * 
 * @route GET /v/folders/list
 * @access Protected (requires JWT)
 */
export const getFolders = async (req: Request, res: Response) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User information not found'
      });
      return;
    }

    // Fetch all folders belonging to this user
    const db = new Database('vault');
    const folders = await db.findMany(collection.folders, {
      userId: req.user.id
    });

    // Get item count for each folder
    const foldersWithCounts = await Promise.all(
      folders.map(async (folder: any) => {
        const itemCount = await db.findMany(collection.vaultItems, {
          userId: req.user!.id,
          folderId: folder._id.toString(),
          deleted: { $ne: true }
        });
        return {
          id: folder._id.toString(),
          name: folder.name,
          description: folder.description,
          itemCount: itemCount.length,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
          accessCount: folder.accessCount || 0
        };
      })
    );

    logger.info(`Fetched ${foldersWithCounts.length} folders for user ${req.user.email}`);

    // Respond with data
    res.status(200).json({ folders: foldersWithCounts });
  } catch (error: any) {
    logger.error(error, 'Error fetching folders');
    res.status(500).json({
      message: 'Failed to fetch folders',
      error: error.message
    });
  }
};

/**
 * Get Frequent Folders Controller
 * 
 * Returns top 4 most accessed folders for the authenticated user.
 * 
 * @route GET /v/folders/frequent
 * @access Protected (requires JWT)
 */
export const getFrequentFolders = async (req: Request, res: Response) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User information not found'
      });
      return;
    }

    // Fetch folders sorted by accessCount (descending)
    const db = new Database('vault');
    const folders = await db.getDb()
      .collection(collection.folders)
      .find({ userId: req.user.id })
      .sort({ accessCount: -1, updatedAt: -1 })
      .limit(4)
      .toArray();

    // Get item count for each folder
    const foldersWithCounts = await Promise.all(
      folders.map(async (folder: any) => {
        const itemCount = await db.findMany(collection.vaultItems, {
          userId: req.user!.id,
          folderId: folder._id.toString(),
          deleted: { $ne: true }
        });
        return {
          id: folder._id.toString(),
          name: folder.name,
          description: folder.description,
          itemCount: itemCount.length,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
          accessCount: folder.accessCount || 0
        };
      })
    );

    logger.info(`Fetched ${foldersWithCounts.length} frequent folders for user ${req.user.email}`);

    // Respond with data
    res.status(200).json({ folders: foldersWithCounts });
  } catch (error: any) {
    logger.error(error, 'Error fetching frequent folders');
    res.status(500).json({
      message: 'Failed to fetch frequent folders',
      error: error.message
    });
  }
};

/**
 * Get Folder by ID Controller
 * 
 * Retrieves a single folder and all its items.
 * Increments accessCount when folder is accessed.
 * 
 * @route GET /v/folders/:id
 * @access Protected (requires JWT)
 */
export const getFolderById = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User information not found'
      });
      return;
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      res.status(400).json({
        message: 'Invalid folder ID',
        error: 'Folder ID must be a valid MongoDB ObjectId'
      });
      return;
    }

    const db = new Database('vault');

    // First, try to find folder owned by user
    let folder = await db.findOne(collection.folders, {
      _id: new ObjectId(id),
      userId: req.user.id
    });

    let isShared = false;
    
    // If not found, check if it's shared with user
    if (!folder) {
      const share = await db.findOne(collection.shares, {
        resourceId: new ObjectId(id),
        recipientId: new ObjectId(req.user.id),
        shareType: 'folder',
        active: true,
      });

      if (share) {
        // User has access via share - fetch the folder
        folder = await db.findOne(collection.folders, {
          _id: new ObjectId(id)
        });
        isShared = true;
      }
    }

    if (!folder) {
      res.status(404).json({
        message: 'Folder not found',
        error: 'Folder does not exist or you do not have permission to access it'
      });
      return;
    }

    // Increment access count (only for owner, not for shared access)
    if (!isShared) {
      await db.updateOne(
        collection.folders,
        { _id: new ObjectId(id), userId: req.user.id },
        { $inc: { accessCount: 1 } }
      );
    }

    // Get all items in this folder
    // For shared folders, get items owned by the sharer, not the recipient
    // Handle both ObjectId and string formats for folderId and userId (backward compatibility)
    const itemsQuery: any = {
      $or: [
        { folderId: new ObjectId(id) },  // Match ObjectId format (new items)
        { folderId: id }                 // Match string format (legacy items)
      ],
      deleted: { $ne: true }
    };

    if (isShared) {
      // For shared folders, get items from the original owner
      // Handle both ObjectId and string formats for userId
      itemsQuery.$and = [
        {
          $or: [
            { userId: new ObjectId(folder.userId) },  // Match ObjectId format
            { userId: folder.userId?.toString() || folder.userId }  // Match string format
          ]
        }
      ];
    } else {
      // For own folders, get own items
      // Handle both ObjectId and string formats for userId
      itemsQuery.$and = [
        {
          $or: [
            { userId: new ObjectId(req.user.id) },  // Match ObjectId format (new items)
            { userId: req.user.id }                 // Match string format (legacy items)
          ]
        }
      ];
    }

    const items = await db.findMany(collection.vaultItems, itemsQuery);

    // Format items with id instead of _id, and handle both encrypted and legacy formats
    const formattedItems = items.map((item: any) => {
      const formattedItem: any = {
        id: item._id?.toString() || item.id,
        userId: item.userId?.toString() || (isShared ? folder.userId?.toString() : req.user.id),
        category: item.category,
        title: item.title,
        folderId: item.folderId?.toString(),
        tags: item.tags,
        isFavorite: item.isFavorite,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        deleted: item.deleted,
        accessCount: item.accessCount || 0,
        lastAccessedAt: item.lastAccessedAt,
      };

      // If item is in encrypted format (new), include encrypted fields
      if (item.encrypted_data && item.iv) {
        formattedItem.encrypted_data = item.encrypted_data;
        formattedItem.iv = item.iv;
        formattedItem.field_count = item.field_count || 0;
        formattedItem.attachment_count = item.attachment_count || 0;
      } else if (item.fields || item.username || item.password) {
        // Legacy plain-text format (for backward compatibility)
        formattedItem.fields = item.fields;
        formattedItem.username = item.username;
        formattedItem.password = item.password;
        formattedItem.url = item.url;
        formattedItem.notes = item.notes;
        formattedItem._legacyFormat = true;
      }

      return formattedItem;
    });

    logger.info(`Folder ${id} accessed by user ${req.user.email}`);

    // Respond with folder and items
    res.status(200).json({
      folder: {
        id: folder._id.toString(),
        name: folder.name,
        description: folder.description,
        itemCount: formattedItems.length,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
        accessCount: (folder.accessCount || 0) + (isShared ? 0 : 1) // Only increment for owner
      },
      items: formattedItems
    });
  } catch (error: any) {
    logger.error(error, 'Error fetching folder');
    res.status(500).json({
      message: 'Failed to fetch folder',
      error: error.message
    });
  }
};

/**
 * Update Folder Controller
 * 
 * Updates a folder's name and/or description.
 * Only the owner can update their folders.
 * 
 * @route PUT /v/folders/:id
 * @access Protected (requires JWT)
 */
export const updateFolder = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User information not found'
      });
      return;
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      res.status(400).json({
        message: 'Invalid folder ID',
        error: 'Folder ID must be a valid MongoDB ObjectId'
      });
      return;
    }

    // Validate name if provided
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
        res.status(400).json({
          message: 'Validation error',
          error: 'Folder name must be a non-empty string'
        });
        return;
      }
    }

    const db = new Database('vault');

    // Build update object
    const updateData: any = {
      updatedAt: new Date().toISOString()
    };

    if (req.body.name !== undefined) {
      updateData.name = req.body.name.trim();
    }

    if (req.body.description !== undefined) {
      updateData.description = req.body.description?.trim() || null;
    }

    // Update only if folder belongs to this user
    const result = await db.updateOne(
      collection.folders,
      { _id: new ObjectId(id), userId: req.user.id },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      res.status(404).json({
        message: 'Folder not found',
        error: 'Folder does not exist or you do not have permission to update it'
      });
      return;
    }

    // Fetch updated folder
    const updatedFolder = await db.findOne(collection.folders, {
      _id: new ObjectId(id),
      userId: req.user.id
    });

    logger.info(`Folder ${id} updated by user ${req.user.email}`);

    // Respond with updated folder
    res.status(200).json({
      message: 'Folder updated successfully',
      folder: {
        id: updatedFolder._id.toString(),
        name: updatedFolder.name,
        description: updatedFolder.description,
        createdAt: updatedFolder.createdAt,
        updatedAt: updatedFolder.updatedAt,
        accessCount: updatedFolder.accessCount || 0
      }
    });
  } catch (error: any) {
    logger.error(error, 'Error updating folder');
    res.status(500).json({
      message: 'Failed to update folder',
      error: error.message
    });
  }
};

/**
 * Delete Folder Controller
 * 
 * Deletes a folder and all associated items permanently.
 * Only the owner can delete their folders.
 * 
 * @route DELETE /v/folders/:id
 * @access Protected (requires JWT)
 */
export const deleteFolder = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      res.status(401).json({
        message: 'Authentication required',
        error: 'User information not found'
      });
      return;
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      res.status(400).json({
        message: 'Invalid folder ID',
        error: 'Folder ID must be a valid MongoDB ObjectId'
      });
      return;
    }

    const db = new Database('vault');

    // Check if folder exists and belongs to user
    const folder = await db.findOne(collection.folders, {
      _id: new ObjectId(id),
      userId: req.user.id
    });

    if (!folder) {
      res.status(404).json({
        message: 'Folder not found',
        error: 'Folder does not exist or you do not have permission to delete it'
      });
      return;
    }

    // Delete all items associated with this folder (hard delete)
    // Handle both ObjectId and string formats for folderId
    const deleteItemsResult = await db.getDb().collection(collection.vaultItems).deleteMany({
      userId: req.user.id,
      $or: [
        { folderId: new ObjectId(id) },  // Match ObjectId format
        { folderId: id }                  // Match string format
      ],
      deleted: { $ne: true }
    });

    // Delete the folder (hard delete, not soft delete)
    await db.getDb().collection(collection.folders).deleteOne({
      _id: new ObjectId(id),
      userId: req.user.id
    });

    logger.info(`Folder ${id} deleted by user ${req.user.email}. ${deleteItemsResult.deletedCount} items deleted.`);

    // Respond with success
    res.status(200).json({
      message: 'Folder deleted successfully',
      folderId: id,
      itemsDeleted: deleteItemsResult.deletedCount
    });
  } catch (error: any) {
    logger.error(error, 'Error deleting folder');
    res.status(500).json({
      message: 'Failed to delete folder',
      error: error.message
    });
  }
};

