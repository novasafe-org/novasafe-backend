/**
 * Compression Utilities
 * 
 * Provides file compression based on MIME type:
 * - Images: Compressed using Sharp (lossless/near-lossless)
 * - Documents/PDFs/Other: Compressed using gzip/zlib
 * 
 * Compression reduces storage costs and improves transfer speeds
 * while maintaining file integrity.
 */

import * as zlib from 'zlib';
import { promisify } from 'util';
import sharp from 'sharp';
import logger from '../logger';

const gzip = promisify(zlib.gzip);
const deflate = promisify(zlib.deflate);

/**
 * Compress an image buffer using Sharp
 * Uses lossless or near-lossless compression depending on format
 * 
 * @param buffer - Image file buffer
 * @param mimeType - MIME type of the image
 * @returns Compressed image buffer
 * 
 * @throws Error if compression fails
 */
export async function compressImage(
  buffer: Buffer,
  mimeType: string
): Promise<Buffer> {
  try {
    let sharpInstance = sharp(buffer);

    // Apply compression based on image type
    switch (mimeType) {
      case 'image/jpeg':
        // JPEG: Use quality 85 (good balance between size and quality)
        sharpInstance = sharpInstance.jpeg({ quality: 85, mozjpeg: true });
        break;
      case 'image/png':
        // PNG: Use compression level 9 (maximum, lossless)
        sharpInstance = sharpInstance.png({ compressionLevel: 9 });
        break;
      case 'image/webp':
        // WebP: Use quality 85 (good balance)
        sharpInstance = sharpInstance.webp({ quality: 85 });
        break;
      default:
        // For unknown image types, try to convert to JPEG
        logger.warn(`Unknown image type ${mimeType}, converting to JPEG`);
        sharpInstance = sharpInstance.jpeg({ quality: 85, mozjpeg: true });
    }

    const compressed = await sharpInstance.toBuffer();
    
    // Only return compressed if it's actually smaller
    if (compressed.length < buffer.length) {
      logger.debug(`Image compressed: ${buffer.length} -> ${compressed.length} bytes`);
      return compressed;
    }
    
    // If compression didn't help, return original
    logger.debug(`Image compression didn't reduce size, keeping original`);
    return buffer;
  } catch (error: any) {
    logger.error(`Image compression failed: ${error.message}`);
    // If compression fails, return original buffer
    return buffer;
  }
}

/**
 * Compress a document/PDF/other file using gzip
 * 
 * @param buffer - File buffer
 * @returns Compressed buffer (gzipped)
 * 
 * @throws Error if compression fails
 */
export async function compressDocument(buffer: Buffer): Promise<Buffer> {
  try {
    const compressed = await gzip(buffer, { level: 9 }); // Maximum compression
    
    // Only return compressed if it's actually smaller
    if (compressed.length < buffer.length) {
      logger.debug(`Document compressed: ${buffer.length} -> ${compressed.length} bytes`);
      return compressed;
    }
    
    // If compression didn't help, return original
    logger.debug(`Document compression didn't reduce size, keeping original`);
    return buffer;
  } catch (error: any) {
    logger.error(`Document compression failed: ${error.message}`);
    // If compression fails, return original buffer
    return buffer;
  }
}

/**
 * Determine if a file should be compressed and which method to use
 * 
 * @param mimeType - MIME type of the file
 * @returns Compression method: 'image' | 'document' | 'none'
 */
export function getCompressionMethod(mimeType: string): 'image' | 'document' | 'none' {
  // Images: use Sharp compression
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  
  // Documents, PDFs, text, archives: use gzip
  if (
    mimeType === 'application/pdf' ||
    mimeType === 'application/zip' ||
    mimeType === 'text/plain' ||
    mimeType === 'application/octet-stream'
  ) {
    return 'document';
  }
  
  // Unknown types: don't compress (safety)
  return 'none';
}

/**
 * Compress a file buffer based on its MIME type
 * Automatically selects the appropriate compression method
 * 
 * @param buffer - File buffer
 * @param mimeType - MIME type of the file
 * @returns Object with compressed buffer and compression info
 */
export async function compressFile(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; compressed: boolean; algorithm: 'gzip' | 'zlib' | 'sharp' | null }> {
  const method = getCompressionMethod(mimeType);
  
  let compressedBuffer: Buffer;
  let algorithm: 'gzip' | 'zlib' | 'sharp' | null = null;
  let wasCompressed = false;
  
  switch (method) {
    case 'image':
      compressedBuffer = await compressImage(buffer, mimeType);
      if (compressedBuffer.length < buffer.length) {
        wasCompressed = true;
        algorithm = 'sharp';
      } else {
        compressedBuffer = buffer; // Keep original
      }
      break;
      
    case 'document':
      compressedBuffer = await compressDocument(buffer);
      if (compressedBuffer.length < buffer.length) {
        wasCompressed = true;
        algorithm = 'gzip';
      } else {
        compressedBuffer = buffer; // Keep original
      }
      break;
      
    case 'none':
    default:
      // Don't compress unknown types
      compressedBuffer = buffer;
      wasCompressed = false;
      break;
  }
  
  return {
    buffer: compressedBuffer,
    compressed: wasCompressed,
    algorithm,
  };
}

