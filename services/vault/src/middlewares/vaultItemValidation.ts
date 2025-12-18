/**
 * Vault Item Validation Middleware
 * 
 * Validates that vault items are in the encrypted format required by zero-knowledge architecture.
 * Ensures all sensitive data is encrypted client-side before reaching the backend.
 */

import { Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import logger from '../logger';

/**
 * Validates that a vault item follows the encrypted format (IVaultItem interface)
 * Required fields:
 * - encrypted_data: Base64 encoded AES-256-GCM ciphertext
 * - iv: Base64 encoded 12-byte initialization vector
 * - category: Item category
 * - field_count: Number of encrypted fields
 * - attachment_count: Number of attachments
 */
export const validateVaultItem = (req: Request, res: Response, next: NextFunction) => {
  const item = req.body;

  // Handle FormData: convert string numbers to numbers
  // When using multipart/form-data, all values come as strings
  if (typeof item.field_count === 'string') {
    const parsed = parseInt(item.field_count, 10);
    if (!isNaN(parsed)) {
      item.field_count = parsed;
    }
  }
  
  if (typeof item.attachment_count === 'string') {
    const parsed = parseInt(item.attachment_count, 10);
    if (!isNaN(parsed)) {
      item.attachment_count = parsed;
    }
  }

  // Handle tags if it's a JSON string (from FormData)
  if (typeof item.tags === 'string') {
    try {
      item.tags = JSON.parse(item.tags);
    } catch (e) {
      // If parsing fails, treat as invalid
      item.tags = undefined;
    }
  }

  // Handle isFavorite if it's a string (from FormData)
  if (typeof item.isFavorite === 'string') {
    item.isFavorite = item.isFavorite === 'true';
  }

  // Check if this is the new encrypted format
  const hasEncryptedData = item.encrypted_data && typeof item.encrypted_data === 'string';
  const hasIV = item.iv && typeof item.iv === 'string';

  // Check if this is the old plain-text format (for backward compatibility detection)
  const hasPlainFields = item.fields && Array.isArray(item.fields);
  const hasPlainTextData = item.username || item.password || item.notes || item.url;

  // If old format detected, reject with helpful error
  if (hasPlainFields || hasPlainTextData) {
    logger.warn('Rejected plain-text vault item. Client must encrypt data before sending.');
    res.status(400).json({
      message: 'Invalid item format',
      error: 'Items must be encrypted client-side before storage. Please use the encryption service to encrypt sensitive data.',
      details: {
        required: ['encrypted_data', 'iv', 'category', 'field_count', 'attachment_count'],
        received: Object.keys(item),
        issue: 'Plain-text data detected. All sensitive data must be encrypted using AES-256-GCM before sending to the backend.'
      }
    });
    return;
  }

  // Validate required encrypted format fields
  if (!hasEncryptedData) {
    res.status(400).json({
      message: 'Validation error',
      error: 'Missing required field: encrypted_data',
      details: {
        field: 'encrypted_data',
        description: 'Base64 encoded AES-256-GCM ciphertext containing all sensitive item data'
      }
    });
    return;
  }

  if (!hasIV) {
    res.status(400).json({
      message: 'Validation error',
      error: 'Missing required field: iv',
      details: {
        field: 'iv',
        description: 'Base64 encoded 12-byte initialization vector used for AES-256-GCM encryption'
      }
    });
    return;
  }

  // Validate IV format (should be base64, decode to check it's 12 bytes)
  try {
    const ivBuffer = Buffer.from(item.iv, 'base64');
    if (ivBuffer.length !== 12) {
      res.status(400).json({
        message: 'Validation error',
        error: 'Invalid IV length',
        details: {
          field: 'iv',
          expected: '12 bytes (when base64 decoded)',
          received: `${ivBuffer.length} bytes`
        }
      });
      return;
    }
  } catch (error) {
    res.status(400).json({
      message: 'Validation error',
      error: 'Invalid IV format',
      details: {
        field: 'iv',
        description: 'IV must be valid base64 encoded string'
      }
    });
    return;
  }

  // Validate category
  if (!item.category || typeof item.category !== 'string') {
    res.status(400).json({
      message: 'Validation error',
      error: 'Missing or invalid field: category',
      details: {
        field: 'category',
        description: 'Item category (e.g., "password", "credit_card", "note")'
      }
    });
    return;
  }

  // Validate field_count
  if (typeof item.field_count !== 'number' || item.field_count < 0) {
    res.status(400).json({
      message: 'Validation error',
      error: 'Missing or invalid field: field_count',
      details: {
        field: 'field_count',
        description: 'Number of encrypted fields in this item (must be >= 0)',
        received: item.field_count
      }
    });
    return;
  }

  // Validate attachment_count
  if (typeof item.attachment_count !== 'number' || item.attachment_count < 0) {
    res.status(400).json({
      message: 'Validation error',
      error: 'Missing or invalid field: attachment_count',
      details: {
        field: 'attachment_count',
        description: 'Number of attachments linked to this item (must be >= 0)',
        received: item.attachment_count
      }
    });
    return;
  }

  // Validate encrypted_data is base64
  try {
    Buffer.from(item.encrypted_data, 'base64');
  } catch (error) {
    res.status(400).json({
      message: 'Validation error',
      error: 'Invalid encrypted_data format',
      details: {
        field: 'encrypted_data',
        description: 'encrypted_data must be valid base64 encoded string'
      }
    });
    return;
  }

  // Validate optional fields
  if (item.folderId && !ObjectId.isValid(item.folderId)) {
    res.status(400).json({
      message: 'Validation error',
      error: 'Invalid folderId format',
      details: {
        field: 'folderId',
        description: 'folderId must be a valid MongoDB ObjectId'
      }
    });
    return;
  }

  // Validate title if provided (should be string)
  if (item.title !== undefined && typeof item.title !== 'string') {
    res.status(400).json({
      message: 'Validation error',
      error: 'Invalid title format',
      details: {
        field: 'title',
        description: 'Title must be a string (can be encrypted or plain for search)'
      }
    });
    return;
  }

  // Validate tags if provided
  if (item.tags !== undefined && !Array.isArray(item.tags)) {
    res.status(400).json({
      message: 'Validation error',
      error: 'Invalid tags format',
      details: {
        field: 'tags',
        description: 'Tags must be an array of strings'
      }
    });
    return;
  }

  // All validations passed
  logger.info('Vault item validation passed - encrypted format confirmed');
  next();
};

/**
 * Validates vault item update (allows partial updates but enforces encrypted format)
 */
export const validateVaultItemUpdate = (req: Request, res: Response, next: NextFunction) => {
  const updates = req.body;

  // If encrypted_data is being updated, validate it
  if (updates.encrypted_data !== undefined) {
    if (typeof updates.encrypted_data !== 'string') {
      res.status(400).json({
        message: 'Validation error',
        error: 'Invalid encrypted_data format',
        details: {
          field: 'encrypted_data',
          description: 'encrypted_data must be a base64 encoded string'
        }
      });
      return;
    }

    // Validate base64 format
    try {
      Buffer.from(updates.encrypted_data, 'base64');
    } catch (error) {
      res.status(400).json({
        message: 'Validation error',
        error: 'Invalid encrypted_data format',
        details: {
          field: 'encrypted_data',
          description: 'encrypted_data must be valid base64 encoded string'
        }
      });
      return;
    }

    // If encrypted_data is updated, IV must also be provided
    if (!updates.iv) {
      res.status(400).json({
        message: 'Validation error',
        error: 'IV is required when updating encrypted_data',
        details: {
          field: 'iv',
          description: 'IV must be provided when updating encrypted_data'
        }
      });
      return;
    }
  }

  // If IV is being updated, validate it
  if (updates.iv !== undefined) {
    if (typeof updates.iv !== 'string') {
      res.status(400).json({
        message: 'Validation error',
        error: 'Invalid IV format',
        details: {
          field: 'iv',
          description: 'IV must be a base64 encoded string'
        }
      });
      return;
    }

    // Validate IV length
    try {
      const ivBuffer = Buffer.from(updates.iv, 'base64');
      if (ivBuffer.length !== 12) {
        res.status(400).json({
          message: 'Validation error',
          error: 'Invalid IV length',
          details: {
            field: 'iv',
            expected: '12 bytes (when base64 decoded)',
            received: `${ivBuffer.length} bytes`
          }
        });
        return;
      }
    } catch (error) {
      res.status(400).json({
        message: 'Validation error',
        error: 'Invalid IV format',
        details: {
          field: 'iv',
          description: 'IV must be valid base64 encoded string'
        }
      });
      return;
    }
  }

  // Validate field_count if provided
  if (updates.field_count !== undefined && (typeof updates.field_count !== 'number' || updates.field_count < 0)) {
    res.status(400).json({
      message: 'Validation error',
      error: 'Invalid field_count',
      details: {
        field: 'field_count',
        description: 'field_count must be a number >= 0'
      }
    });
    return;
  }

  // Validate attachment_count if provided
  if (updates.attachment_count !== undefined && (typeof updates.attachment_count !== 'number' || updates.attachment_count < 0)) {
    res.status(400).json({
      message: 'Validation error',
      error: 'Invalid attachment_count',
      details: {
        field: 'attachment_count',
        description: 'attachment_count must be a number >= 0'
      }
    });
    return;
  }

  // Reject old format fields if present
  if (updates.fields || updates.username || updates.password || updates.notes || updates.url) {
    res.status(400).json({
      message: 'Invalid update format',
      error: 'Plain-text fields are not allowed. Use encrypted_data instead.',
      details: {
        rejectedFields: ['fields', 'username', 'password', 'notes', 'url'],
        required: 'All sensitive data must be in encrypted_data field'
      }
    });
    return;
  }

  next();
};

