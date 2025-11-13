# Database Migrations

This directory contains database migration scripts for setting up the complete security-enabled schema.

## Overview

The migrations implement all security levels (1-6) from the Security Implementation Plan:
- **Level 1**: Core security fields (Users + Vault Items encryption)
- **Level 2**: Two-Factor Authentication (2FA fields)
- **Level 3**: Sessions collection
- **Level 4**: Audit logs collection
- **Level 5**: Security events + Breach cache
- **Level 6**: Recovery fields + Folder encryption

## Prerequisites

- MongoDB connection string configured in `config/config.ts`
- Node.js and TypeScript installed
- All dependencies installed (`npm install`)

## Migration Scripts

### 001-complete-schema-setup.ts

Creates all collections with proper validation schemas:
- `users` - User accounts with security fields
- `vaultItems` - Encrypted vault items
- `folders` - Folders with optional encryption
- `sessions` - Active user sessions
- `audit_logs` - Activity audit logs
- `security_events` - Security event tracking
- `password_breaches` - Password breach cache

**Run this first:**
```bash
npm run migrate:schema
```

### 002-setup-indexes.ts

Creates all required indexes for optimal performance:
- High-priority indexes (unique constraints, frequently queried fields)
- Performance indexes (compound indexes for common queries)
- TTL indexes (auto-cleanup for expired data)

**Run this after schema setup:**
```bash
npm run migrate:indexes
```

## Running Migrations

### Option 1: Run All Migrations (Recommended)
```bash
npm run migrate:all
```

This will:
1. Create all collections with validation schemas
2. Create all indexes

### Option 2: Run Migrations Individually
```bash
# Step 1: Create collections
npm run migrate:schema

# Step 2: Create indexes
npm run migrate:indexes
```

### Option 3: Run Directly with ts-node
```bash
# Schema setup
npx ts-node --require tsconfig-paths/register migrations/001-complete-schema-setup.ts

# Index setup
npx ts-node --require tsconfig-paths/register migrations/002-setup-indexes.ts
```

## Migration Safety

- ✅ **Idempotent**: Scripts can be run multiple times safely
- ✅ **Non-destructive**: Existing collections are skipped (not overwritten)
- ✅ **Validation**: All collections have JSON schema validators
- ✅ **Indexes**: All indexes are created with proper options

## Index Summary

### High-Priority Indexes
- `users.googleId` (unique)
- `users.email` (unique)
- `vaultItems.userId + category`
- `sessions.tokenId` (unique)
- `sessions.userId + revoked`

### Performance Indexes
- `audit_logs.userId + timestamp`
- `security_events.severity + resolved`
- `vaultItems.userId + folderId` (sparse)

### TTL Indexes (Auto-cleanup)
- `sessions.expiresAt` → 30 days
- `audit_logs.timestamp` → 2 years
- `security_events.timestamp` → 1 year
- `password_breaches.lastChecked` → 7 days

## Troubleshooting

### Error: Collection already exists
This is normal if you've run the migration before. The script will skip existing collections.

### Error: Index already exists
If an index already exists, MongoDB will skip it. This is safe.

### Error: Connection failed
- Check your MongoDB connection string in `config/config.ts`
- Ensure MongoDB is running and accessible
- Verify network connectivity

## Notes

- **No Data Loss**: These migrations are designed for a fresh database
- **Backward Compatible**: Existing data structures are preserved
- **Production Ready**: All validations and indexes are production-grade

## Next Steps

After running migrations:
1. ✅ Verify collections are created: Check MongoDB Atlas/Compass
2. ✅ Verify indexes are created: Run `db.collection.getIndexes()` in MongoDB shell
3. ✅ Test API endpoints: Ensure they work with new schema
4. ✅ Update controllers: Use new model interfaces

