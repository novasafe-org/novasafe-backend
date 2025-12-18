/**
 * Attachment Type Definition
 * 
 * Represents metadata for file attachments linked to vault items.
 * Files are stored compressed on disk, and this metadata is stored in MongoDB.
 * 
 * Security Note: File paths are relative to prevent directory traversal attacks.
 * Absolute server paths are never exposed to clients.
 */

export interface IAttachment {
  /**
   * Original filename as provided by the user
   * Sanitized to prevent path traversal attacks
   */
  originalName: string;

  /**
   * Generated safe filename stored on disk
   * Format: <timestamp>-<randomUUID>-<originalExtension>
   * Example: "1711231231-9f3e1c2a-4b5c-6d7e-8f9a-0b1c2d3e4f5a.pdf.gz"
   */
  storedName: string;

  /**
   * MIME type determined server-side
   * Never trust client-provided MIME types
   * Validated against allowed list
   */
  mimeType: string;

  /**
   * Original file size in bytes (before compression)
   */
  fileSize: number;

  /**
   * Compressed file size in bytes (after compression)
   * Only present if compression was applied
   */
  compressedSize?: number;

  /**
   * Relative file path from attachments root
   * Format: "attachments/<USER_ID>/<ITEM_ID>/<storedName>"
   * Never expose absolute server paths
   */
  filePath: string;

  /**
   * Whether the file was compressed
   * true = compressed, false = stored as-is
   */
  compressed: boolean;

  /**
   * Timestamp when file was uploaded
   */
  createdAt: Date;

  /**
   * Optional: Compression algorithm used
   * 'gzip' | 'zlib' | 'sharp' | null
   */
  compressionAlgorithm?: 'gzip' | 'zlib' | 'sharp' | null;
}

/**
 * File upload validation result
 */
export interface IFileValidationResult {
  valid: boolean;
  error?: string;
  mimeType?: string;
  size?: number;
}

/**
 * Allowed MIME types for file uploads
 * Security: Only these types are accepted
 */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/zip',
  'text/plain',
  'application/octet-stream', // Generic binary (with additional validation)
] as const;

/**
 * Blocked file extensions (security)
 * These are never allowed, even if MIME type matches
 */
export const BLOCKED_EXTENSIONS = [
  '.exe',
  '.bat',
  '.sh',
  '.cmd',
  '.ps1',
  '.vbs',
  '.js',
  '.jar',
  '.dll',
  '.scr',
  '.com',
  '.pif',
] as const;

/**
 * Maximum file size: 25MB (in bytes)
 */
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

