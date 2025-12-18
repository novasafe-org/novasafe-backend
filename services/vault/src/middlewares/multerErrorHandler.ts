/**
 * Multer Error Handler Middleware
 * 
 * Handles Multer errors (file size limits, etc.) and returns user-friendly error messages.
 */

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { MAX_FILE_SIZE } from '../types/Attachment';

/**
 * Error handler for Multer errors
 * Converts Multer errors into user-friendly JSON responses
 */
export const multerErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const maxSizeMB = MAX_FILE_SIZE / (1024 * 1024);
      res.status(400).json({
        message: 'File too large',
        error: `File size exceeds the maximum limit of ${maxSizeMB}MB. Please choose a smaller file.`,
        code: 'FILE_TOO_LARGE',
        maxSize: MAX_FILE_SIZE,
        maxSizeMB: maxSizeMB,
      });
      return;
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
      res.status(400).json({
        message: 'Too many files',
        error: 'Maximum 10 files can be uploaded at once. Please reduce the number of files.',
        code: 'TOO_MANY_FILES',
        maxFiles: 10,
      });
      return;
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({
        message: 'Unexpected file field',
        error: 'File upload field name must be "attachments".',
        code: 'INVALID_FIELD_NAME',
      });
      return;
    }

    // Generic Multer error
    res.status(400).json({
      message: 'File upload error',
      error: err.message || 'An error occurred while uploading the file.',
      code: err.code || 'MULTER_ERROR',
    });
    return;
  }

  // If it's not a Multer error, pass it to the next error handler
  next(err);
};

