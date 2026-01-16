# File Upload & Compression System - Implementation Guide

## 📋 Overview

This document describes the production-grade file upload and compression system implemented for NovaSafe backend. The system handles file attachments for vault items with security, compression, and proper storage management.

## 🏗️ Architecture

### Directory Structure

```
services/vault/src/
├── types/
│   └── Attachment.ts          # Type definitions for attachments
├── utils/
│   ├── filePaths.ts           # Path utilities (user/item folders)
│   └── compression.ts          # Compression logic (images/docs)
├── services/
│   └── files/
│       └── FileStorageService.ts  # Main file storage service
├── middlewares/
│   └── upload.ts              # Multer configuration
└── controllers/
    └── Vault.ts                # Updated addItem() with file handling
```

### File Storage Structure

```
output/
└── attachments/
    └── <USER_ID>/
        └── <ITEM_ID>/
            ├── 1711231231-uuid-1.pdf.gz
            ├── 1711231232-uuid-2.jpg
            └── ...
```

## 📦 Required Packages

Install the following packages:

```bash
npm install multer @types/multer sharp mime-types uuid @types/uuid fs-extra @types/fs-extra --legacy-peer-deps
```

## 🔧 Implementation Details

### 1. Type Definitions (`types/Attachment.ts`)

Defines:
- `IAttachment` interface for attachment metadata
- `IFileValidationResult` for validation results
- Allowed MIME types whitelist
- Blocked extensions blacklist
- Maximum file size constant (25MB)

### 2. File Path Utilities (`utils/filePaths.ts`)

Functions:
- `getUserFolder(userId)` - Get user's attachment folder
- `getItemFolder(userId, itemId)` - Get item's attachment folder
- `ensureDirExists(path)` - Create directory (thread-safe)
- `buildFilePath()` - Build absolute file path
- `buildRelativePath()` - Build relative path for MongoDB

**Security**: All paths are sanitized to prevent directory traversal attacks.

### 3. Compression Utilities (`utils/compression.ts`)

Functions:
- `compressImage(buffer, mimeType)` - Compress images using Sharp
- `compressDocument(buffer)` - Compress docs using gzip
- `compressFile(buffer, mimeType)` - Auto-select compression method

**Compression Rules**:
- Images (JPEG/PNG/WebP): Sharp compression (lossless/near-lossless)
- Documents/PDFs: gzip compression
- Unknown types: No compression (safety)

### 4. File Storage Service (`services/files/FileStorageService.ts`)

Main service with functions:
- `validateFile(file)` - Validate file (size, MIME, security)
- `storeFile(file, userId, itemId)` - Store single file
- `storeFiles(files, userId, itemId)` - Store multiple files (parallel)
- `deleteFile(filePath)` - Delete single file
- `deleteItemFiles(userId, itemId)` - Delete all item files

**Features**:
- Server-side MIME type detection (never trust client)
- Safe filename generation: `<timestamp>-<uuid>-<ext>`
- Automatic compression based on file type
- Thread-safe directory creation
- Rollback on failure

### 5. Upload Middleware (`middlewares/upload.ts`)

Multer configuration:
- Memory storage (files in buffer until validated)
- File size limit: 25MB
- Maximum 10 files per request
- Field name: `attachments`

### 6. Controller Updates (`controllers/Vault.ts`)

Modified `addItem()` function:

1. **Extract files** from `req.files`
2. **Create item** in database first (to get itemId)
3. **Store files** if any exist
4. **Update item** with attachment metadata
5. **Rollback** item if file storage fails
6. **Return** item with attachments array

## 🔒 Security Features

1. **MIME Type Validation**: Server-side detection, never trust client
2. **File Size Limits**: 25MB maximum per file
3. **Extension Blocking**: Blocks `.exe`, `.bat`, `.sh`, etc.
4. **Path Traversal Prevention**: All paths sanitized
5. **Safe Filenames**: Generated server-side with UUID
6. **Relative Paths Only**: Never expose absolute server paths
7. **Directory Isolation**: User/item folder structure

## 📝 API Usage

### Request Format

**Endpoint**: `POST /v/addItem`

**Content-Type**: `multipart/form-data`

**Fields**:
- `encrypted_data` (string) - Encrypted item data
- `iv` (string) - Initialization vector
- `category` (string) - Item category
- `field_count` (number) - Number of fields
- `attachments` (File[]) - One or more files

### Response Format

```json
{
  "success": true,
  "itemId": "507f1f77bcf86cd799439011",
  "userId": "507f191e810c19729de860ea",
  "encrypted_data": "...",
  "iv": "...",
  "category": "document",
  "field_count": 3,
  "attachment_count": 2,
  "attachments": [
    {
      "originalName": "document.pdf",
      "storedName": "1711231231-9f3e1c2a-4b5c-6d7e-8f9a-0b1c2d3e4f5a.pdf.gz",
      "mimeType": "application/pdf",
      "fileSize": 1234567,
      "compressedSize": 987654,
      "filePath": "attachments/USER_ID/ITEM_ID/1711....gz",
      "compressed": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

## 🚀 Future Enhancements

The code is structured to support:

1. **File Previews**: Thumbnail generation for images
2. **Decompression & Download**: Endpoint to retrieve files
3. **File Deletion**: Remove attachments from items
4. **Virus Scanning**: Integration with ClamAV
5. **Encryption-at-Rest**: Encrypt files using user keys
6. **Deduplication**: Detect duplicate files
7. **Cloud Storage**: Migration to S3/Azure Blob

## ⚠️ Important Notes

1. **Install Packages**: Run `npm install` with the packages listed above
2. **Create Output Directory**: The system will auto-create `output/attachments/` on first use
3. **Error Handling**: All file operations have proper error handling and rollback
4. **Logging**: All operations are logged for debugging
5. **Type Safety**: Full TypeScript support with proper types

## 🧪 Testing

To test the implementation:

1. Install all required packages
2. Start the server
3. Send a POST request to `/v/addItem` with:
   - Authentication header
   - Form data with encrypted item fields
   - One or more files in `attachments` field
4. Verify files are stored in `output/attachments/<USER_ID>/<ITEM_ID>/`
5. Check MongoDB for attachment metadata in item document

## 📚 Code Quality

- ✅ Production-grade error handling
- ✅ Comprehensive JSDoc comments
- ✅ Type-safe TypeScript
- ✅ Security-first design
- ✅ Modular and maintainable
- ✅ Future-proof architecture

