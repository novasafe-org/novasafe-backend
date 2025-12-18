/**
 * Multer Upload Middleware
 * 
 * Configures multer for handling multipart/form-data file uploads.
 * Files are stored in memory as buffers for processing.
 * 
 * Security:
 * - File size limits enforced
 * - MIME type validation (in FileStorageService)
 * - Memory storage (files not written to disk until validated)
 */

import multer from 'multer';
import { Request } from 'express';
import { MAX_FILE_SIZE } from '../types/Attachment';

/**
 * Memory storage configuration
 * Files are kept in memory as buffers for validation and compression
 */
const storage = multer.memoryStorage();

/**
 * File filter function
 * Additional validation before multer processes the file
 */
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  // Allow all files initially - detailed validation happens in FileStorageService
  // This is just a basic check
  cb(null, true);
};

/**
 * Multer configuration
 */
export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE, // 25MB max
    files: 10, // Maximum 10 files per request
  },
  fileFilter,
});

/**
 * Middleware for handling file uploads in addItem endpoint
 * Accepts multiple files with field name 'attachments'
 */
export const uploadAttachments = upload.array('attachments', 10);

