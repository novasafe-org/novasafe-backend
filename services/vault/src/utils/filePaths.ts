/**
 * File Path Utilities
 * 
 * Provides safe, normalized path operations for file storage.
 * All paths are normalized to prevent directory traversal attacks.
 * 
 * Directory Structure:
 * output/
 *   attachments/
 *     <USER_ID>/
 *       <ITEM_ID>/
 *         <files>
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import logger from '../logger';

/**
 * Base directory for all file attachments
 * Located at project root: output/attachments
 */
const ATTACHMENTS_BASE_DIR = path.join(process.cwd(), 'output', 'attachments');

/**
 * Get the user's attachment folder path
 * 
 * @param userId - User's MongoDB ObjectId (string or ObjectId)
 * @returns Normalized absolute path to user's folder
 * 
 * @example
 * getUserFolder("507f1f77bcf86cd799439011")
 * // Returns: "/path/to/output/attachments/507f1f77bcf86cd799439011"
 */
export function getUserFolder(userId: string | any): string {
  const userIdStr = userId.toString();
  // Sanitize: remove any path separators to prevent directory traversal
  const sanitizedUserId = userIdStr.replace(/[\/\\]/g, '');
  return path.join(ATTACHMENTS_BASE_DIR, sanitizedUserId);
}

/**
 * Get the item's attachment folder path
 * 
 * @param userId - User's MongoDB ObjectId
 * @param itemId - Item's MongoDB ObjectId
 * @returns Normalized absolute path to item's folder
 * 
 * @example
 * getItemFolder("507f1f77bcf86cd799439011", "507f191e810c19729de860ea")
 * // Returns: "/path/to/output/attachments/507f1f77bcf86cd799439011/507f191e810c19729de860ea"
 */
export function getItemFolder(userId: string | any, itemId: string | any): string {
  const userIdStr = userId.toString();
  const itemIdStr = itemId.toString();
  
  // Sanitize: remove any path separators
  const sanitizedUserId = userIdStr.replace(/[\/\\]/g, '');
  const sanitizedItemId = itemIdStr.replace(/[\/\\]/g, '');
  
  return path.join(ATTACHMENTS_BASE_DIR, sanitizedUserId, sanitizedItemId);
}

/**
 * Ensure a directory exists, creating it if necessary
 * Thread-safe: Uses fs-extra's ensureDir which handles race conditions
 * 
 * @param dirPath - Absolute path to directory
 * @returns Promise that resolves when directory is ready
 * 
 * @throws Error if directory creation fails
 */
export async function ensureDirExists(dirPath: string): Promise<void> {
  try {
    await fs.ensureDir(dirPath);
    logger.debug(`Directory ensured: ${dirPath}`);
  } catch (error: any) {
    logger.error(`Failed to create directory ${dirPath}: ${error.message}`);
    throw new Error(`Failed to create directory: ${error.message}`);
  }
}

/**
 * Build a complete file path for storing an attachment
 * 
 * @param userId - User's MongoDB ObjectId
 * @param itemId - Item's MongoDB ObjectId
 * @param fileName - Safe filename (already sanitized)
 * @returns Absolute path to the file
 * 
 * @example
 * buildFilePath("507f1f77bcf86cd799439011", "507f191e810c19729de860ea", "file.pdf.gz")
 * // Returns: "/path/to/output/attachments/507f1f77bcf86cd799439011/507f191e810c19729de860ea/file.pdf.gz"
 */
export function buildFilePath(
  userId: string | any,
  itemId: string | any,
  fileName: string
): string {
  const itemFolder = getItemFolder(userId, itemId);
  // Sanitize filename: remove any path separators
  const sanitizedFileName = path.basename(fileName).replace(/[\/\\]/g, '');
  return path.join(itemFolder, sanitizedFileName);
}

/**
 * Build a relative file path (for storage in MongoDB)
 * Never exposes absolute server paths
 * 
 * @param userId - User's MongoDB ObjectId
 * @param itemId - Item's MongoDB ObjectId
 * @param fileName - Safe filename
 * @returns Relative path from attachments root
 * 
 * @example
 * buildRelativePath("507f1f77bcf86cd799439011", "507f191e810c19729de860ea", "file.pdf.gz")
 * // Returns: "attachments/507f1f77bcf86cd799439011/507f191e810c19729de860ea/file.pdf.gz"
 */
export function buildRelativePath(
  userId: string | any,
  itemId: string | any,
  fileName: string
): string {
  const userIdStr = userId.toString().replace(/[\/\\]/g, '');
  const itemIdStr = itemId.toString().replace(/[\/\\]/g, '');
  const sanitizedFileName = path.basename(fileName).replace(/[\/\\]/g, '');
  
  // Use forward slashes for consistency (works on all platforms)
  return path.join('attachments', userIdStr, itemIdStr, sanitizedFileName).replace(/\\/g, '/');
}

/**
 * Get the base attachments directory
 * 
 * @returns Absolute path to attachments root
 */
export function getAttachmentsBaseDir(): string {
  return ATTACHMENTS_BASE_DIR;
}

