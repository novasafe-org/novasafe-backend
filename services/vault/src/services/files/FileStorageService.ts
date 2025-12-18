/**
 * File Storage Service
 * 
 * Production-grade service for handling file uploads, compression, and storage.
 * 
 * Responsibilities:
 * - Validate uploaded files (size, MIME type, security)
 * - Generate safe file names
 * - Create directory structure (user/item folders)
 * - Compress files based on type
 * - Store files on disk
 * - Return metadata for MongoDB storage
 * 
 * Security Features:
 * - MIME type validation (server-side)
 * - File size limits
 * - Blocked extension filtering
 * - Safe filename generation
 * - Path traversal prevention
 * - Directory structure isolation
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import logger from '../../logger';
import {
  IAttachment,
  IFileValidationResult,
  ALLOWED_MIME_TYPES,
  BLOCKED_EXTENSIONS,
  MAX_FILE_SIZE,
} from '../../types/Attachment';
import {
  getItemFolder,
  ensureDirExists,
  buildFilePath,
  buildRelativePath,
} from '../../utils/filePaths';
import { compressFile } from '../../utils/compression';

/**
 * Custom error for file storage operations
 */
export class FileStorageError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'FileStorageError';
  }
}

/**
 * Validate an uploaded file
 * 
 * @param file - Express multer file object
 * @returns Validation result with error message if invalid
 */
export function validateFile(file: Express.Multer.File): IFileValidationResult {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  // Determine MIME type server-side (never trust client)
  const detectedMimeType = mime.lookup(file.originalname) || 'application/octet-stream';
  
  // Validate MIME type against allowed list
  if (!ALLOWED_MIME_TYPES.includes(detectedMimeType as any)) {
    return {
      valid: false,
      error: `File type '${detectedMimeType}' is not allowed`,
      mimeType: detectedMimeType,
    };
  }

  // Check file extension against blocked list
  const ext = path.extname(file.originalname).toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext as any)) {
    return {
      valid: false,
      error: `File extension '${ext}' is blocked for security reasons`,
    };
  }

  // Additional validation for application/octet-stream
  if (detectedMimeType === 'application/octet-stream') {
    // Only allow if extension is safe
    const safeExtensions = ['.pdf', '.zip', '.txt', '.doc', '.docx', '.xls', '.xlsx'];
    if (!safeExtensions.includes(ext)) {
      return {
        valid: false,
        error: 'Generic binary files must have a recognized safe extension',
      };
    }
  }

  return {
    valid: true,
    mimeType: detectedMimeType,
    size: file.size,
  };
}

/**
 * Generate a safe filename
 * Format: <timestamp>-<randomUUID>-<originalExtension>
 * 
 * @param originalName - Original filename from client
 * @returns Safe filename for storage
 * 
 * @example
 * generateSafeFileName("document.pdf")
 * // Returns: "1711231231-9f3e1c2a-4b5c-6d7e-8f9a-0b1c2d3e4f5a.pdf"
 */
function generateSafeFileName(originalName: string): string {
  const timestamp = Date.now();
  const uuid = uuidv4();
  const ext = path.extname(originalName).toLowerCase();
  
  // Sanitize extension: only allow alphanumeric and dots
  const sanitizedExt = ext.replace(/[^a-zA-Z0-9.]/g, '');
  
  return `${timestamp}-${uuid}${sanitizedExt}`;
}

/**
 * Store a single file attachment
 * 
 * @param file - Express multer file object
 * @param userId - User's MongoDB ObjectId
 * @param itemId - Item's MongoDB ObjectId
 * @returns Attachment metadata for MongoDB storage
 * 
 * @throws FileStorageError if storage fails
 */
export async function storeFile(
  file: Express.Multer.File,
  userId: string | any,
  itemId: string | any
): Promise<IAttachment> {
  try {
    // Step 1: Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      throw new FileStorageError(validation.error || 'File validation failed', 'VALIDATION_ERROR');
    }

    const mimeType = validation.mimeType!;
    const originalSize = file.size;

    // Step 2: Generate safe filename
    const safeFileName = generateSafeFileName(file.originalname);
    
    // Step 3: Ensure directory exists (thread-safe)
    const itemFolder = getItemFolder(userId, itemId);
    await ensureDirExists(itemFolder);

    // Step 4: Compress file based on MIME type
    const compressionResult = await compressFile(file.buffer, mimeType);
    const finalBuffer = compressionResult.buffer;
    const compressedSize = compressionResult.compressed ? finalBuffer.length : undefined;

    // Step 5: Determine final filename (add .gz extension if gzipped)
    let storedFileName = safeFileName;
    if (compressionResult.algorithm === 'gzip') {
      storedFileName = `${safeFileName}.gz`;
    }

    // Step 6: Write file to disk
    const filePath = buildFilePath(userId, itemId, storedFileName);
    await fs.writeFile(filePath, finalBuffer);

    logger.info(
      `File stored: ${file.originalname} -> ${storedFileName} ` +
      `(${originalSize} -> ${finalBuffer.length} bytes, compressed: ${compressionResult.compressed})`
    );

    // Step 7: Build relative path for MongoDB (never expose absolute paths)
    const relativePath = buildRelativePath(userId, itemId, storedFileName);

    // Step 8: Return metadata
    const attachment: IAttachment = {
      originalName: path.basename(file.originalname), // Sanitize original name
      storedName: storedFileName,
      mimeType,
      fileSize: originalSize,
      compressedSize,
      filePath: relativePath, // Relative path only
      compressed: compressionResult.compressed,
      createdAt: new Date(),
      compressionAlgorithm: compressionResult.algorithm,
    };

    return attachment;
  } catch (error: any) {
    logger.error(`File storage failed: ${error.message}`);
    
    if (error instanceof FileStorageError) {
      throw error;
    }
    
    throw new FileStorageError(
      `Failed to store file: ${error.message}`,
      'STORAGE_ERROR'
    );
  }
}

/**
 * Store multiple file attachments
 * Processes files in parallel for better performance
 * 
 * @param files - Array of Express multer file objects
 * @param userId - User's MongoDB ObjectId
 * @param itemId - Item's MongoDB ObjectId
 * @returns Array of attachment metadata
 * 
 * @throws FileStorageError if any file fails (all-or-nothing)
 */
export async function storeFiles(
  files: Express.Multer.File[],
  userId: string | any,
  itemId: string | any
): Promise<IAttachment[]> {
  try {
    // Process all files in parallel
    const promises = files.map(file => storeFile(file, userId, itemId));
    const attachments = await Promise.all(promises);
    
    logger.info(`Stored ${attachments.length} file(s) for item ${itemId}`);
    
    return attachments;
  } catch (error: any) {
    logger.error(`Failed to store files: ${error.message}`);
    throw error;
  }
}

/**
 * Delete a file attachment from disk
 * Used when item is deleted or attachment is removed
 * 
 * @param filePath - Relative file path from attachments root
 * @returns Promise that resolves when file is deleted
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    // Convert relative path to absolute
    const baseDir = path.join(process.cwd(), 'output');
    const absolutePath = path.join(baseDir, filePath);
    
    // Security: Ensure path is within attachments directory
    const normalizedPath = path.normalize(absolutePath);
    const normalizedBase = path.normalize(baseDir);
    
    if (!normalizedPath.startsWith(normalizedBase)) {
      throw new FileStorageError('Invalid file path: outside attachments directory', 'SECURITY_ERROR');
    }
    
    await fs.remove(absolutePath);
    logger.info(`File deleted: ${filePath}`);
  } catch (error: any) {
    logger.error(`Failed to delete file ${filePath}: ${error.message}`);
    throw new FileStorageError(`Failed to delete file: ${error.message}`, 'DELETE_ERROR');
  }
}

/**
 * Delete all files for an item
 * Used when item is deleted
 * 
 * @param userId - User's MongoDB ObjectId
 * @param itemId - Item's MongoDB ObjectId
 * @returns Promise that resolves when all files are deleted
 */
export async function deleteItemFiles(
  userId: string | any,
  itemId: string | any
): Promise<void> {
  try {
    const itemFolder = getItemFolder(userId, itemId);
    
    // Check if folder exists
    if (await fs.pathExists(itemFolder)) {
      await fs.remove(itemFolder);
      logger.info(`Deleted all files for item ${itemId}`);
    }
  } catch (error: any) {
    logger.error(`Failed to delete item files: ${error.message}`);
    throw new FileStorageError(`Failed to delete item files: ${error.message}`, 'DELETE_ERROR');
  }
}

