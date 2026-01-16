import { Request, Response } from 'express';
import { DBCONFIG } from '../../config/config';
import Database from '../../database/connection';
import { ObjectId } from 'mongodb';
import logger from '../logger';
// Import auth middleware to extend Express Request type with user property
import '../middlewares/auth';
import { addUserPermissionsToResponse } from '../utils/responseHelper';
import { storeFiles, FileStorageError, deleteItemFiles } from '../services/files/FileStorageService';
import { IAttachment } from '../types/Attachment';
import { logActivity } from '../utils/activityLogHelper';
import { createWelcomeItem, hasWelcomeItem } from '../services/welcomeItemService';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import sharp from 'sharp';

const collection = DBCONFIG.vault.collections;

/**
 * Add Vault Item Controller
 * 
 * Creates a new vault item and links it to the authenticated user.
 * The userId from JWT token (req.user) is automatically attached.
 * 
 * IMPORTANT: This endpoint expects items in encrypted format (zero-knowledge architecture).
 * All sensitive data must be encrypted client-side using AES-256-GCM before sending.
 * 
 * Required fields:
 * - encrypted_data: Base64 encoded AES-256-GCM ciphertext
 * - iv: Base64 encoded 12-byte initialization vector
 * - category: Item category
 * - field_count: Number of encrypted fields
 * - attachment_count: Number of attachments
 * 
 * @route POST /v/addItem
 * @access Protected (requires JWT)
 */
export const addItem = async (req: Request, res: Response) => {
  try {
    // Ensure user is authenticated (should be guaranteed by authMiddleware)
    if (!req.user || !req.user.id) {
      res.status(401).json({ 
        message: 'Authentication required',
        error: 'User information not found'
      });
      return;
    }

    // Validation is done by validateVaultItem middleware
    // At this point, we know the item is in the correct encrypted format

    // Step 1: Check for file uploads (will be processed after item creation)
    let attachments: IAttachment[] = [];
    const files = (req.files as Express.Multer.File[] | undefined) || undefined;
    
    if (files && files.length > 0) {
      logger.info(`Received ${files.length} file(s) for upload`);
    }

    // Prepare item according to IVaultItem interface
    const newItem: any = {
      userId: new ObjectId(req.user.id),  // Link item to user (convert to ObjectId)
      encrypted_data: req.body.encrypted_data,  // Base64 encoded ciphertext
      iv: req.body.iv,  // Base64 encoded IV
      category: req.body.category,
      field_count: req.body.field_count || 0,
      attachment_count: files ? files.length : (req.body.attachment_count || 0),
      createdAt: new Date(),
      updatedAt: new Date(),
      deleted: false,
      accessCount: 0,
      lastAccessedAt: null,
    };

    // Optional fields
    if (req.body.title !== undefined) {
      newItem.title = req.body.title;
    }

    // Handle folderId: explicitly set to null if provided as null, or validate and convert if provided as a value
    if (req.body.folderId !== undefined) {
      if (req.body.folderId === null) {
        // Explicitly set folderId to null for items in "Personal" safe (no folder)
        newItem.folderId = null;
      } else if (ObjectId.isValid(req.body.folderId)) {
        // Validate and convert folderId to ObjectId for items in a specific folder
        newItem.folderId = new ObjectId(req.body.folderId);
      } else {
        res.status(400).json({
          message: 'Validation error',
          error: 'Invalid folderId format'
        });
        return;
      }
    }

    if (req.body.tags !== undefined && Array.isArray(req.body.tags)) {
      newItem.tags = req.body.tags;
    }

    if (req.body.isFavorite !== undefined) {
      newItem.isFavorite = Boolean(req.body.isFavorite);
    }

    // Save to database first (we need the itemId to store files)
    const db = new Database('vault');
    const result = await db.insertOne(collection.vaultItems, newItem);
    const itemId = result.insertedId;

    // Step 2: Store files if any (now that we have itemId)
    if (files && files.length > 0) {
      try {
        attachments = await storeFiles(files, req.user.id, itemId);
        
        // Update item with attachment metadata
        await db.updateOne(
          collection.vaultItems,
          { _id: itemId },
          { 
            $set: { 
              attachments: attachments,
              attachment_count: attachments.length,
              updatedAt: new Date(),
            } 
          }
        );
        
        logger.info(`Stored ${attachments.length} attachment(s) for item ${itemId}`);
      } catch (error: any) {
        // If file storage fails, delete the item (rollback)
        await db.deleteOne(collection.vaultItems, { _id: itemId });
        
        if (error instanceof FileStorageError) {
          res.status(400).json({
            message: 'File upload error',
            error: error.message,
            code: error.code,
          });
          return;
        }
        
        logger.error(`File storage failed, item rolled back: ${error.message}`);
        throw error;
      }
    }

    logger.info(
      `Encrypted item created by user ${req.user.email}: ${newItem.title || 'Untitled'} ` +
      `(ID: ${itemId}, ${attachments.length} attachment(s))`
    );

    // Log item creation (non-blocking)
    try {
      const user = await db.findOne(collection.vaultUsers, { _id: new ObjectId(req.user.id) }) as any;
      if (user && user.companyName) {
        await logActivity(req, user, {
          action: 'ITEM_CREATED',
          targetType: 'item',
          targetId: itemId.toString(),
          description: `Created vault item: ${newItem.title || 'Untitled'}`,
          metadata: {
            itemId: itemId.toString(),
            category: newItem.category,
            hasAttachments: attachments.length > 0,
            attachmentCount: attachments.length,
            folderId: newItem.folderId?.toString() || null,
          },
        });
      }
    } catch (logError: any) {
      logger.warn(`Failed to log item creation: ${logError.message}`);
    }

    // Fetch the complete item with attachments
    const completeItem = await db.findOne(collection.vaultItems, { _id: itemId });

    // Return created item with id mapped from _id
    const createdItem: any = {
      success: true,
      itemId: itemId.toString(),
      userId: req.user.id,
      encrypted_data: newItem.encrypted_data,
      iv: newItem.iv,
      category: newItem.category,
      field_count: newItem.field_count,
      attachment_count: attachments.length,
      title: newItem.title,
      folderId: newItem.folderId?.toString(),
      tags: newItem.tags,
      isFavorite: newItem.isFavorite,
      createdAt: newItem.createdAt.toISOString(),
      updatedAt: newItem.updatedAt.toISOString(),
      deleted: false,
      accessCount: 0,
      lastAccessedAt: null,
      attachments: attachments.map(att => ({
        originalName: att.originalName,
        storedName: att.storedName,
        mimeType: att.mimeType,
        fileSize: att.fileSize,
        compressedSize: att.compressedSize,
        filePath: att.filePath,
        compressed: att.compressed,
        createdAt: att.createdAt.toISOString(),
      })),
    };

    // Include user permissions in response
    const response = addUserPermissionsToResponse(req, createdItem);
    res.status(201).json(response);
  } catch (error: any) {
    logger.error(error, 'Error adding item');
    res.status(500).json({ 
      message: 'Failed to add item', 
      error: error.message 
    });
  }
};

/**
 * Get Single Vault Item Controller
 * 
 * Retrieves a single vault item by ID.
 * For shared items, checks if user has access via shares.
 * 
 * @route GET /v/:id/getItem
 * @access Protected (requires JWT)
 */
export const getItem = async (req: Request, res: Response) => {
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

    // Validate id is a valid ObjectId
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ 
        message: 'Invalid item ID format'
      });
      return;
    }

    const db = new Database('vault');
    
    // First, try to find item owned by user
    // Query with ObjectId conversion to match how items are stored
    let item = await db.findOne(collection.vaultItems, {
      $or: [
        { _id: new ObjectId(id) },
        { id: id }
      ],
      $and: [
        {
          $or: [
            { userId: new ObjectId(req.user.id) },  // Match ObjectId format (new items)
            { userId: req.user.id }  // Match string format (legacy items)
          ]
        },
        { deleted: { $ne: true } }
      ]
    });

    // If not found, check if it's shared with user
    if (!item) {
      const share = await db.findOne(collection.shares, {
        resourceId: new ObjectId(id),
        recipientId: new ObjectId(req.user.id),
        shareType: 'item',
        active: true,
      });

      if (share) {
        // User has access via share - fetch the item
        item = await db.findOne(collection.vaultItems, {
          $or: [
            { _id: new ObjectId(id) },
            { id: id }
          ],
          deleted: { $ne: true }
        });
      }
    }

    if (!item) {
      res.status(404).json({ 
        message: 'Item not found or you don\'t have permission to access it'
      });
      return;
    }

    // Format item with id instead of _id
    // Handle both encrypted format (new) and plain-text format (legacy)
    const formattedItem: any = {
      id: item._id?.toString() || item.id,
      userId: item.userId?.toString() || req.user.id,
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
      
      // Include attachments if they exist
      if (item.attachments && Array.isArray(item.attachments)) {
        formattedItem.attachments = item.attachments.map((att: any) => ({
          originalName: att.originalName,
          storedName: att.storedName,
          mimeType: att.mimeType,
          fileSize: att.fileSize,
          compressedSize: att.compressedSize,
          filePath: att.filePath,
          compressed: att.compressed,
          createdAt: att.createdAt,
        }));
      }
    } else if (item.fields || item.username || item.password) {
      // Legacy plain-text format (for backward compatibility)
      logger.warn(`Legacy plain-text item accessed (ID: ${formattedItem.id}). Item should be migrated to encrypted format.`);
      formattedItem.fields = item.fields;
      formattedItem.username = item.username;
      formattedItem.password = item.password;
      formattedItem.url = item.url;
      formattedItem.notes = item.notes;
      formattedItem._legacyFormat = true;
    }

    logger.info(`Item ${id} fetched by user ${req.user.email}`);

    // Log item view (non-blocking)
    try {
      const user = await db.findOne(collection.vaultUsers, { _id: new ObjectId(req.user.id) }) as any;
      if (user && user.companyName) {
        await logActivity(req, user, {
          action: 'ITEM_VIEWED',
          targetType: 'item',
          targetId: id,
          description: `Viewed vault item: ${formattedItem.title || 'Untitled'}`,
          metadata: {
            itemId: id,
            category: formattedItem.category,
            accessCount: formattedItem.accessCount || 0,
          },
        });
      }
    } catch (logError: any) {
      logger.warn(`Failed to log item view: ${logError.message}`);
    }

    // Include user permissions in response
    const response = addUserPermissionsToResponse(req, { item: formattedItem });
    res.status(200).json(response);
  } catch (error: any) {
    logger.error(error, 'Error fetching item');
    res.status(500).json({ 
      message: 'Failed to fetch item', 
      error: error.message 
    });
  }
};

/**
 * Update Vault Item Controller
 * 
 * Updates an existing vault item. Only the owner can update.
 * 
 * @route PUT /v/:id/updateItem
 * @access Protected (requires JWT)
 */
export const updateItem = async (req: Request, res: Response) => {
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

    // Validate id is a valid ObjectId
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ 
        message: 'Invalid item ID format'
      });
      return;
    }

    // Update data - ensure only owner can update
    // Validation middleware ensures encrypted format is maintained
    const db = new Database('vault');
    
    // Prepare update data according to IVaultItem interface
    const updateData: any = {
      updatedAt: new Date()
    };

    // Only allow updates to valid encrypted format fields
    if (req.body.encrypted_data !== undefined) {
      updateData.encrypted_data = req.body.encrypted_data;
    }

    if (req.body.iv !== undefined) {
      updateData.iv = req.body.iv;
    }

    if (req.body.title !== undefined) {
      updateData.title = req.body.title;
    }

    if (req.body.category !== undefined) {
      updateData.category = req.body.category;
    }

    if (req.body.folderId !== undefined) {
      if (req.body.folderId === null) {
        updateData.folderId = null;
      } else if (ObjectId.isValid(req.body.folderId)) {
        updateData.folderId = new ObjectId(req.body.folderId);
      } else {
        res.status(400).json({
          message: 'Validation error',
          error: 'Invalid folderId format'
        });
        return;
      }
    }

    if (req.body.tags !== undefined) {
      updateData.tags = req.body.tags;
    }

    if (req.body.isFavorite !== undefined) {
      updateData.isFavorite = Boolean(req.body.isFavorite);
    }

    if (req.body.field_count !== undefined) {
      updateData.field_count = req.body.field_count;
    }

    if (req.body.attachment_count !== undefined) {
      updateData.attachment_count = req.body.attachment_count;
    }
    
    // Update only if item belongs to this user
    // Query with ObjectId conversion to match how items are stored
    const result = await db.updateOne(
      collection.vaultItems, 
      { 
        $or: [
          { _id: new ObjectId(id) },
          { id: id }
        ],
        $and: [
          {
            $or: [
              { userId: new ObjectId(req.user.id) },  // Match ObjectId format (new items)
              { userId: req.user.id }  // Match string format (legacy items)
            ]
          }
        ]
      },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      res.status(404).json({ 
        message: 'Item not found or you don\'t have permission to update it'
      });
      return;
    }

    logger.info(`Item ${id} updated by user ${req.user.email}`);

    // Log item update (non-blocking)
    try {
      const user = await db.findOne(collection.vaultUsers, { _id: new ObjectId(req.user.id) }) as any;
      if (user && user.companyName) {
        await logActivity(req, user, {
          action: 'ITEM_UPDATED',
          targetType: 'item',
          targetId: id,
          description: `Updated vault item: ${updateData.title || 'Untitled'}`,
          metadata: {
            itemId: id,
            category: updateData.category || null,
            fieldsUpdated: Object.keys(updateData).filter(k => k !== 'updatedAt').length,
          },
        });
      }
    } catch (logError: any) {
      logger.warn(`Failed to log item update: ${logError.message}`);
    }

    // Fetch updated item to return
    // Query with ObjectId conversion to match how items are stored
    const updatedItem = await db.findOne(collection.vaultItems, {
      $or: [
        { _id: new ObjectId(id) },
        { id: id }
      ],
      $and: [
        {
          $or: [
            { userId: new ObjectId(req.user.id) },  // Match ObjectId format (new items)
            { userId: req.user.id }  // Match string format (legacy items)
          ]
        }
      ]
    });

    // Format item with id instead of _id
    const formattedItem = updatedItem ? {
      id: updatedItem._id?.toString() || updatedItem.id,
      userId: updatedItem.userId?.toString() || req.user.id,
      encrypted_data: updatedItem.encrypted_data,
      iv: updatedItem.iv,
      category: updatedItem.category,
      field_count: updatedItem.field_count,
      attachment_count: updatedItem.attachment_count,
      title: updatedItem.title,
      folderId: updatedItem.folderId?.toString(),
      tags: updatedItem.tags,
      isFavorite: updatedItem.isFavorite,
      createdAt: updatedItem.createdAt,
      updatedAt: updatedItem.updatedAt,
      deleted: updatedItem.deleted,
      accessCount: updatedItem.accessCount,
      lastAccessedAt: updatedItem.lastAccessedAt,
    } : null;

    // Respond with success
    res.status(200).json({ 
      message: 'Item updated successfully', 
      item: formattedItem
    });
  } catch (error: any) {
    logger.error(error, 'Error updating item');
    res.status(500).json({ 
      message: 'Failed to update item', 
      error: error.message 
    });
  }
};

/**
 * Delete Vault Item Controller
 * 
 * Soft deletes a vault item (marks as deleted). Only the owner can delete.
 * 
 * @route DELETE /v/:id/deleteItem
 * @access Protected (requires JWT)
 */
export const deleteItem = async (req: Request, res: Response) => {
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

    // Validate id is a valid ObjectId
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ 
        message: 'Invalid item ID format'
      });
      return;
    }

    // Soft delete - mark as deleted instead of removing from DB
    // Query with ObjectId conversion to match how items are stored
    const db = new Database('vault');
    
    // First, check if item exists and belongs to user
    const item = await db.findOne(collection.vaultItems, {
      $or: [
        { _id: new ObjectId(id) },
        { id: id }
      ],
      $and: [
        {
          $or: [
            { userId: new ObjectId(req.user.id) },  // Match ObjectId format (new items)
            { userId: req.user.id }  // Match string format (legacy items)
          ]
        }
      ]
    });

    if (!item) {
      res.status(404).json({ 
        message: 'Item not found or you don\'t have permission to delete it'
      });
      return;
    }

    // Delete associated files from disk
    try {
      await deleteItemFiles(req.user.id, id);
      logger.info(`Deleted files for item ${id}`);
    } catch (error: any) {
      // Log error but continue with item deletion
      logger.error(`Failed to delete files for item ${id}: ${error.message}`);
    }

    // Soft delete: Set deleted_at timestamp, but keep deleted = false
    // The scheduler will permanently delete after 30 days
    const result = await db.updateOne(
      collection.vaultItems,
      { 
        $or: [
          { _id: new ObjectId(id) },
          { id: id }
        ],
        $and: [
          {
            $or: [
              { userId: new ObjectId(req.user.id) },  // Match ObjectId format (new items)
              { userId: req.user.id }  // Match string format (legacy items)
            ]
          }
        ]
      },
      { $set: { deleted: false, deleted_at: new Date() } }
    );

    logger.info(`Item ${id} deleted by user ${req.user.email}`);

    // Log item deletion (non-blocking)
    try {
      const user = await db.findOne(collection.vaultUsers, { _id: new ObjectId(req.user.id) }) as any;
      if (user && user.companyName) {
        await logActivity(req, user, {
          action: 'ITEM_DELETED',
          targetType: 'item',
          targetId: id,
          description: `Deleted vault item: ${item.title || 'Untitled'}`,
          metadata: {
            itemId: id,
            category: item.category || null,
            hadAttachments: !!(item.attachments && item.attachments.length > 0),
          },
        });
      }
    } catch (logError: any) {
      logger.warn(`Failed to log item deletion: ${logError.message}`);
    }

    // Respond with success
    res.status(200).json({ 
      message: 'Item deleted successfully', 
      itemId: id 
    });
  } catch (error: any) {
    logger.error(error, 'Error deleting item');
    res.status(500).json({ 
      message: 'Failed to delete item', 
      error: error.message 
    });
  }
};

/**
 * Get Vault Items Controller
 * 
 * Retrieves all vault items belonging to the authenticated user.
 * Items are filtered by userId to ensure users only see their own data.
 * 
 * @route GET /v/getAll
 * @access Protected (requires JWT)
 */
export const getItems = async (req: Request, res: Response) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      res.status(401).json({ 
        message: 'Authentication required',
        error: 'User information not found'
      });
      return;
    }

    const db = new Database('vault');
    const userId = req.user.id;

    // Check if user has a welcome item, if not create one
    try {
      const hasWelcome = await hasWelcomeItem(userId);
      if (!hasWelcome) {
        // Fetch user details to get name and email
        const user = await db.findOne(collection.vaultUsers, {
          _id: new ObjectId(userId),
        });

        if (user) {
          const userName = (user as any).name || (user as any).fullName || req.user.email?.split('@')[0] || 'User';
          const userEmail = (user as any).email || req.user.email || '';
          // Note: We don't store plain passwords, so password will be empty
          // If user has a password set, it's hashed and we can't retrieve it
          const userPassword = ''; // Passwords are hashed, we can't retrieve plain password

          await createWelcomeItem(userId, userName, userEmail, userPassword);
          logger.info(`Welcome item created for user ${userId}`);
        }
      }
    } catch (welcomeError: any) {
      // Don't fail the request if welcome item creation fails
      logger.warn(`Failed to create welcome item: ${welcomeError.message}`);
    }

    // Fetch data - ONLY items belonging to this user
    // Query with ObjectId conversion to match how items are stored
    const items = await db.findMany(collection.vaultItems, { 
      $or: [
        { userId: new ObjectId(userId) },  // Match ObjectId format (new items)
        { userId: userId }  // Match string format (legacy items)
      ],
      deleted: { $ne: true },  // Exclude permanently deleted items
      deleted_at: null  // Exclude soft-deleted items (in trash)
    });

    logger.info(`Fetched ${items.length} items for user ${req.user.email}`);

    // Map _id to id for frontend compatibility
    // Handle both encrypted format (new) and plain-text format (legacy) for backward compatibility
    const formattedItems = items.map((item: any) => {
      const baseItem = {
        id: item._id?.toString() || item.id,
        userId: item.userId?.toString() || req.user.id,
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
        const formatted: any = {
          ...baseItem,
          encrypted_data: item.encrypted_data,
          iv: item.iv,
          field_count: item.field_count || 0,
          attachment_count: item.attachment_count || 0,
          // Include welcome item flag if present
          _isWelcomeItem: item._isWelcomeItem || false,
        };
        
        // Include attachments if they exist
        if (item.attachments && Array.isArray(item.attachments)) {
          formatted.attachments = item.attachments.map((att: any) => ({
            originalName: att.originalName,
            storedName: att.storedName,
            mimeType: att.mimeType,
            fileSize: att.fileSize,
            compressedSize: att.compressedSize,
            filePath: att.filePath,
            compressed: att.compressed,
            createdAt: att.createdAt,
          }));
        }
        
        return formatted;
      }

      // Legacy plain-text format (for backward compatibility)
      // Log warning but still return the item
      if (item.fields || item.username || item.password) {
        logger.warn(`Legacy plain-text item found (ID: ${baseItem.id}). Item should be migrated to encrypted format.`);
        return {
          ...baseItem,
          // Include legacy fields for backward compatibility
          fields: item.fields,
          username: item.username,
          password: item.password,
          url: item.url,
          notes: item.notes,
          // Mark as legacy format
          _legacyFormat: true,
          // Include welcome item flag if present
          _isWelcomeItem: item._isWelcomeItem || false,
        };
      }

      // Fallback: return base item
      return baseItem;
    });

    // Respond with data
    // Include user permissions in response
    const response = addUserPermissionsToResponse(req, { items: formattedItems });
    res.status(200).json(response);
  } catch (error: any) {
    logger.error(error, 'Error fetching items');
    res.status(500).json({ 
      message: 'Failed to fetch items', 
      error: error.message 
    });
  }
};

/**
 * Track Item Access Controller
 * 
 * Increments access count and updates last accessed timestamp for analytics.
 * Used for "Most Used" sorting.
 * 
 * @route POST /v/:id/trackAccess
 * @access Protected (requires JWT)
 */
export const trackItemAccess = async (req: Request, res: Response) => {
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

    const db = new Database('vault');
    
    // Validate id is a valid ObjectId
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ 
        message: 'Invalid item ID format'
      });
      return;
    }
    
    // First, ensure accessCount exists for old items (backward compatibility)
    // Then increment access count and update last accessed date
    
    // Check if item exists and belongs to user (owner)
    // Query with ObjectId conversion to match how items are stored
    const existingItem = await db.findOne(collection.vaultItems, { 
      $or: [
        { _id: new ObjectId(id) },
        { id: id }
      ],
      $and: [
        {
          $or: [
            { userId: new ObjectId(req.user.id) },  // Match ObjectId format (new items)
            { userId: req.user.id }  // Match string format (legacy items)
          ]
        },
        { deleted: { $ne: true } }
      ]
    });
    
    // If item doesn't belong to user, check if it's shared with user
    let isShared = false;
    if (!existingItem) {
      const share = await db.findOne(collection.shares, {
        resourceId: new ObjectId(id),
        recipientId: new ObjectId(req.user.id),
        shareType: 'item',
        active: true,
      });

      if (share) {
        // Item is shared with user - verify item exists
        const sharedItem = await db.findOne(collection.vaultItems, {
          $or: [
            { _id: new ObjectId(id) },
            { id: id }
          ],
          deleted: { $ne: true }
        });

        if (sharedItem) {
          isShared = true;
          // For shared items, we don't track access (that's for owner's analytics)
          // But we return success to avoid frontend errors
          logger.info(`Access tracking skipped for shared item ${id} by user ${req.user.email}`);
          res.status(200).json({ 
            message: 'Access tracking skipped for shared items',
            note: 'Access tracking is only recorded for item owners'
          });
          return;
        }
      }

      // Item not found or not accessible
      res.status(404).json({ 
        message: 'Item not found or you don\'t have permission to access it'
      });
      return;
    }
    
    // Initialize accessCount if it doesn't exist (for old items)
    const currentAccessCount = existingItem.accessCount ?? 0;
    const newAccessCount = currentAccessCount + 1;
    
    // Update with increment and last accessed date
    // Query with ObjectId conversion to match how items are stored
    const result = await db.updateOne(
      collection.vaultItems,
      { 
        $or: [
          { _id: new ObjectId(id) },
          { id: id }
        ],
        $and: [
          {
            $or: [
              { userId: new ObjectId(req.user.id) },  // Match ObjectId format (new items)
              { userId: req.user.id }  // Match string format (legacy items)
            ]
          }
        ]
      },
      { 
        $set: { 
          accessCount: newAccessCount,
          lastAccessedAt: new Date().toISOString()
        }
      }
    );

    if (result.matchedCount === 0) {
      res.status(404).json({ 
        message: 'Item not found or you don\'t have permission to access it'
      });
      return;
    }

    logger.info(`Item ${id} accessed by user ${req.user.email}`);

    // Fetch and return updated item
    // Query with ObjectId conversion to match how items are stored
    const updatedItem = await db.findOne(collection.vaultItems, { 
      $or: [
        { _id: new ObjectId(id) },
        { id: id }
      ],
      $and: [
        {
          $or: [
            { userId: new ObjectId(req.user.id) },  // Match ObjectId format (new items)
            { userId: req.user.id }  // Match string format (legacy items)
          ]
        }
      ]
    });

    // Format item with id instead of _id
    const formattedItem = updatedItem ? {
      ...updatedItem,
      id: updatedItem._id?.toString() || updatedItem.id,
      _id: undefined,
    } : null;

    // Respond with success
    res.status(200).json({ 
      message: 'Access tracked successfully',
      item: formattedItem
    });
  } catch (error: any) {
    logger.error(error, 'Error tracking item access');
    res.status(500).json({ 
      message: 'Failed to track item access', 
      error: error.message 
    });
  }
};

const gunzip = promisify(zlib.gunzip);

/**
 * Download File Attachment Controller
 * 
 * Downloads a file attachment for a vault item.
 * Handles decompression if the file was compressed.
 * 
 * @route GET /v/:itemId/attachments/:attachmentId/download
 * @access Protected (requires JWT)
 */
export const downloadAttachment = async (req: Request, res: Response) => {
  const { itemId, attachmentId } = req.params;

  try {
    // Check authentication - support both header and query param (for React Native Linking)
    let userId: string | undefined = req.user?.id;
    
    // If no user from middleware, try to get from query token (for React Native compatibility)
    if (!userId && req.query.token) {
      try {
        const { verifyToken } = await import('../utils/generateToken');
        const decoded = verifyToken(req.query.token as string);
        userId = decoded.id;
      } catch (tokenError) {
        // Token in query is invalid, continue to check header
      }
    }

    if (!userId) {
      res.status(401).json({ 
        message: 'Authentication required',
        error: 'User information not found'
      });
      return;
    }

    // Validate IDs
    if (!ObjectId.isValid(itemId)) {
      res.status(400).json({ 
        message: 'Invalid item ID format'
      });
      return;
    }

    const db = new Database('vault');
    
    // Find item and verify ownership
    const item = await db.findOne(collection.vaultItems, {
      $or: [
        { _id: new ObjectId(itemId) },
        { id: itemId }
      ],
      $and: [
        {
          $or: [
            { userId: new ObjectId(userId) },
            { userId: userId }
          ]
        },
        { deleted: { $ne: true } }
      ]
    });

    if (!item) {
      res.status(404).json({ 
        message: 'Item not found or you don\'t have permission to access it'
      });
      return;
    }

    // Find attachment in item
    if (!item.attachments || !Array.isArray(item.attachments)) {
      res.status(404).json({ 
        message: 'No attachments found for this item'
      });
      return;
    }

    const attachment = item.attachments.find((att: any) => 
      att.storedName === attachmentId || att.filePath?.includes(attachmentId)
    );

    if (!attachment) {
      res.status(404).json({ 
        message: 'Attachment not found'
      });
      return;
    }

    // Build file path
    const baseDir = path.join(process.cwd(), 'output');
    const filePath = path.join(baseDir, attachment.filePath);

    // Security: Ensure path is within attachments directory
    const normalizedPath = path.normalize(filePath);
    const normalizedBase = path.normalize(baseDir);
    
    if (!normalizedPath.startsWith(normalizedBase)) {
      res.status(403).json({ 
        message: 'Invalid file path'
      });
      return;
    }

    // Check if file exists
    if (!await fs.pathExists(filePath)) {
      res.status(404).json({ 
        message: 'File not found on server'
      });
      return;
    }

    // Read file
    let fileBuffer = await fs.readFile(filePath);

    // Decompress if needed
    if (attachment.compressed && attachment.compressionAlgorithm === 'gzip') {
      try {
        fileBuffer = await gunzip(fileBuffer);
      } catch (error: any) {
        logger.error(`Failed to decompress file: ${error.message}`);
        res.status(500).json({ 
          message: 'Failed to decompress file'
        });
        return;
      }
    }

    // Set headers for download
    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName}"`);
    res.setHeader('Content-Length', fileBuffer.length.toString());

    // Send file
    res.send(fileBuffer);

    logger.info(`File downloaded: ${attachment.originalName} by user ${userId}`);
  } catch (error: any) {
    logger.error(error, 'Error downloading attachment');
    res.status(500).json({ 
      message: 'Failed to download file', 
      error: error.message 
    });
  }
};

/**
 * View File Attachment Controller
 * 
 * Serves a file attachment for viewing (inline display).
 * Handles decompression and image processing if needed.
 * 
 * @route GET /v/:itemId/attachments/:attachmentId/view
 * @access Protected (requires JWT)
 */
export const viewAttachment = async (req: Request, res: Response) => {
  const { itemId, attachmentId } = req.params;

  try {
    // Check authentication - support both header and query param (for React Native Linking)
    let userId: string | undefined = req.user?.id;
    
    // If no user from middleware, try to get from query token (for React Native compatibility)
    if (!userId && req.query.token) {
      try {
        const { verifyToken } = await import('../utils/generateToken');
        const decoded = verifyToken(req.query.token as string);
        userId = decoded.id;
      } catch (tokenError) {
        // Token in query is invalid, continue to check header
      }
    }

    if (!userId) {
      res.status(401).json({ 
        message: 'Authentication required',
        error: 'User information not found'
      });
      return;
    }

    // Validate IDs
    if (!ObjectId.isValid(itemId)) {
      res.status(400).json({ 
        message: 'Invalid item ID format'
      });
      return;
    }

    const db = new Database('vault');
    
    // Find item and verify ownership
    const item = await db.findOne(collection.vaultItems, {
      $or: [
        { _id: new ObjectId(itemId) },
        { id: itemId }
      ],
      $and: [
        {
          $or: [
            { userId: new ObjectId(userId) },
            { userId: userId }
          ]
        },
        { deleted: { $ne: true } }
      ]
    });

    if (!item) {
      res.status(404).json({ 
        message: 'Item not found or you don\'t have permission to access it'
      });
      return;
    }

    // Find attachment in item
    if (!item.attachments || !Array.isArray(item.attachments)) {
      res.status(404).json({ 
        message: 'No attachments found for this item'
      });
      return;
    }

    const attachment = item.attachments.find((att: any) => 
      att.storedName === attachmentId || att.filePath?.includes(attachmentId)
    );

    if (!attachment) {
      res.status(404).json({ 
        message: 'Attachment not found'
      });
      return;
    }

    // Build file path
    const baseDir = path.join(process.cwd(), 'output');
    const filePath = path.join(baseDir, attachment.filePath);

    // Security: Ensure path is within attachments directory
    const normalizedPath = path.normalize(filePath);
    const normalizedBase = path.normalize(baseDir);
    
    if (!normalizedPath.startsWith(normalizedBase)) {
      res.status(403).json({ 
        message: 'Invalid file path'
      });
      return;
    }

    // Check if file exists
    if (!await fs.pathExists(filePath)) {
      res.status(404).json({ 
        message: 'File not found on server'
      });
      return;
    }

    // Read file
    let fileBuffer = await fs.readFile(filePath);

    // Decompress if needed
    if (attachment.compressed && attachment.compressionAlgorithm === 'gzip') {
      try {
        fileBuffer = await gunzip(fileBuffer);
      } catch (error: any) {
        logger.error(`Failed to decompress file: ${error.message}`);
        res.status(500).json({ 
          message: 'Failed to decompress file'
        });
        return;
      }
    }

    // For images, we can optionally resize/optimize
    const isImage = attachment.mimeType?.startsWith('image/');
    if (isImage && req.query.size) {
      try {
        const size = req.query.size as string;
        const [width, height] = size.split('x').map(Number);
        if (width && height) {
          // Use sharp to resize
          const resizedBuffer = await sharp(fileBuffer)
            .resize(width, height, { fit: 'inside', withoutEnlargement: true })
            .toBuffer();
          // Create a new Buffer from the resized buffer to ensure type compatibility
          // @ts-ignore - sharp Buffer type is compatible but TypeScript doesn't recognize it
          fileBuffer = Buffer.from(resizedBuffer);
        }
      } catch (error: any) {
        logger.warn(`Failed to resize image: ${error.message}`);
        // Continue with original image
      }
    }

    // Set headers for inline viewing
    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${attachment.originalName}"`);
    res.setHeader('Content-Length', fileBuffer.length.toString());
    res.setHeader('Cache-Control', 'private, max-age=3600');

    // Send file
    res.send(fileBuffer);

    logger.info(`File viewed: ${attachment.originalName} by user ${userId}`);
  } catch (error: any) {
    logger.error(error, 'Error viewing attachment');
    res.status(500).json({ 
      message: 'Failed to view file', 
      error: error.message 
    });
  }
};
