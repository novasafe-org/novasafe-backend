import { Request, Response } from 'express';
import { DBCONFIG } from '../../config/config';
import Database from '../../database/connection';
import { ObjectId } from 'mongodb';
import logger from '../logger';
// Import auth middleware to extend Express Request type with user property
import '../middlewares/auth';

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

    // Prepare item according to IVaultItem interface
    const newItem: any = {
      userId: new ObjectId(req.user.id),  // Link item to user (convert to ObjectId)
      encrypted_data: req.body.encrypted_data,  // Base64 encoded ciphertext
      iv: req.body.iv,  // Base64 encoded IV
      category: req.body.category,
      field_count: req.body.field_count || 0,
      attachment_count: req.body.attachment_count || 0,
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

    if (req.body.folderId !== undefined && req.body.folderId !== null) {
      // Validate and convert folderId to ObjectId
      if (ObjectId.isValid(req.body.folderId)) {
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

    // Save to database
    const db = new Database('vault');
    const result = await db.insertOne(collection.vaultItems, newItem);

    logger.info(`Encrypted item created by user ${req.user.email}: ${newItem.title || 'Untitled'} (ID: ${result.insertedId})`);

    // Return created item with id mapped from _id
    const createdItem = {
      id: result.insertedId.toString(),
      userId: req.user.id,
      encrypted_data: newItem.encrypted_data,
      iv: newItem.iv,
      category: newItem.category,
      field_count: newItem.field_count,
      attachment_count: newItem.attachment_count,
      title: newItem.title,
      folderId: newItem.folderId?.toString(),
      tags: newItem.tags,
      isFavorite: newItem.isFavorite,
      createdAt: newItem.createdAt.toISOString(),
      updatedAt: newItem.updatedAt.toISOString(),
      deleted: false,
      accessCount: 0,
      lastAccessedAt: null,
    };

    res.status(201).json(createdItem);
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

    res.status(200).json({ item: formattedItem });
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
      { $set: { deleted: true, deletedAt: new Date().toISOString() } }
    );

    if (result.matchedCount === 0) {
      res.status(404).json({ 
        message: 'Item not found or you don\'t have permission to delete it'
      });
      return;
    }

    logger.info(`Item ${id} deleted by user ${req.user.email}`);

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

    // Fetch data - ONLY items belonging to this user
    const db = new Database('vault');
    // Query with ObjectId conversion to match how items are stored
    const items = await db.findMany(collection.vaultItems, { 
      $or: [
        { userId: new ObjectId(req.user.id) },  // Match ObjectId format (new items)
        { userId: req.user.id }  // Match string format (legacy items)
      ],
      deleted: { $ne: true }  // Exclude deleted items
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
        return {
          ...baseItem,
          encrypted_data: item.encrypted_data,
          iv: item.iv,
          field_count: item.field_count || 0,
          attachment_count: item.attachment_count || 0,
        };
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
        };
      }

      // Fallback: return base item
      return baseItem;
    });

    // Respond with data
    res.status(200).json({ items: formattedItems });
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
    
    // Check if item exists and get current accessCount
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
        }
      ]
    });
    
    if (!existingItem) {
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
