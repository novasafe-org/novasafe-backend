/**
 * Complete Database Schema Setup Migration
 * 
 * This migration script sets up all collections with proper validation schemas
 * for Levels 1-6 of the security implementation plan.
 * 
 * Assumes: No existing data in the database
 * 
 * Execution:
 * 1. Run this script once to set up all collections
 * 2. Run 002-setup-indexes.ts to create all indexes
 */

import { MongoClient } from 'mongodb';
import { DBCONFIG } from '../config/config';

const dbConfig = DBCONFIG.vault;
const uri = dbConfig.uri;
const dbName = dbConfig.databaseName;

/**
 * Main migration function
 */
async function runMigration() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(dbName);

    // ============================================
    // Level 1 & 2 & 6: Users Collection
    // ============================================
    console.log('\n📝 Setting up users collection...');
    
    try {
      await db.createCollection('users', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['googleId', 'name', 'email', 'createdAt', 'updatedAt'],
            properties: {
              googleId: { bsonType: 'string' },
              name: { bsonType: 'string' },
              email: { bsonType: 'string' },
              picture: { bsonType: 'string' },
              createdAt: { bsonType: 'date' },
              updatedAt: { bsonType: 'date' },
              // Level 1: Encryption
              encryptionSalt: { bsonType: ['string', 'null'] },
              keyDerivationParams: {
                bsonType: 'object',
                properties: {
                  algorithm: { enum: ['argon2id'] },
                  iterations: { bsonType: 'int', minimum: 1 },
                  memory: { bsonType: 'int', minimum: 1 },
                  parallelism: { bsonType: 'int', minimum: 1 }
                }
              },
              // Level 1: Account Security
              failedLoginAttempts: { bsonType: 'int', minimum: 0, maximum: 10 },
              accountLockedUntil: { bsonType: ['date', 'null'] },
              lastPasswordChange: { bsonType: ['date', 'null'] },
              // Level 2: 2FA
              totpSecret: { bsonType: ['string', 'null'] },
              totpEnabled: { bsonType: 'bool' },
              totpBackupCodes: { bsonType: ['array', 'null'] },
              totpBackupCodesUsed: { bsonType: ['array', 'null'] },
              totpEnabledAt: { bsonType: ['date', 'null'] },
              totpLastVerified: { bsonType: ['date', 'null'] },
              // Level 6: Recovery
              recoveryKeyHash: { bsonType: ['string', 'null'] },
              recoveryKeyCreatedAt: { bsonType: ['date', 'null'] },
              recoveryKeyUsed: { bsonType: 'bool' },
              recoveryKeyUsedAt: { bsonType: ['date', 'null'] },
              accountRecoveryEmail: { bsonType: ['string', 'null'] },
              accountRecoveryPhone: { bsonType: ['string', 'null'] }
            }
          }
        }
      });
      console.log('✅ Users collection created');
    } catch (error: any) {
      if (error.code === 48) {
        console.log('⚠️  Users collection already exists, skipping...');
      } else {
        throw error;
      }
    }

    // ============================================
    // Level 1: Vault Items Collection
    // ============================================
    console.log('\n📝 Setting up vaultItems collection...');
    
    try {
      await db.createCollection('vaultItems', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['userId', 'encrypted_data', 'iv', 'category', 'field_count', 'attachment_count', 'createdAt', 'updatedAt'],
            properties: {
              userId: { bsonType: ['objectId', 'string'] },
              // Level 1: Encryption
              encrypted_data: { bsonType: 'string' },
              iv: { bsonType: 'string' },
              // Metadata
              title: { bsonType: ['string', 'null'] },
              category: { bsonType: 'string' },
              folderId: { bsonType: ['objectId', 'string', 'null'] },
              tags: { bsonType: ['array', 'null'] },
              field_count: { bsonType: 'int', minimum: 0 },
              attachment_count: { bsonType: 'int', minimum: 0 },
              isFavorite: { bsonType: 'bool' },
              deleted: { bsonType: 'bool' },
              createdAt: { bsonType: 'date' },
              updatedAt: { bsonType: 'date' },
              lastAccessedAt: { bsonType: ['date', 'null'] },
              accessCount: { bsonType: 'int', minimum: 0 }
            }
          }
        }
      });
      console.log('✅ VaultItems collection created');
    } catch (error: any) {
      if (error.code === 48) {
        console.log('⚠️  VaultItems collection already exists, skipping...');
      } else {
        throw error;
      }
    }

    // ============================================
    // Level 6: Folders Collection (Update)
    // ============================================
    console.log('\n📝 Setting up folders collection...');
    
    try {
      await db.createCollection('folders', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['userId', 'name', 'createdAt', 'updatedAt', 'accessCount'],
            properties: {
              userId: { bsonType: 'string' },
              name: { bsonType: 'string' },
              description: { bsonType: ['string', 'null'] },
              createdAt: { bsonType: 'date' },
              updatedAt: { bsonType: 'date' },
              accessCount: { bsonType: 'int', minimum: 0 },
              // Level 6: Optional Encryption
              isEncrypted: { bsonType: 'bool' },
              encrypted_name: { bsonType: ['string', 'null'] },
              name_iv: { bsonType: ['string', 'null'] },
              encrypted_description: { bsonType: ['string', 'null'] },
              description_iv: { bsonType: ['string', 'null'] }
            }
          }
        }
      });
      console.log('✅ Folders collection created');
    } catch (error: any) {
      if (error.code === 48) {
        console.log('⚠️  Folders collection already exists, skipping...');
      } else {
        throw error;
      }
    }

    // ============================================
    // Level 3: Sessions Collection
    // ============================================
    console.log('\n📝 Setting up sessions collection...');
    
    try {
      await db.createCollection('sessions', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['userId', 'tokenId', 'refreshTokenHash', 'deviceName', 'deviceType', 'deviceInfo', 'lastActivity', 'createdAt', 'expiresAt', 'revoked'],
            properties: {
              userId: { bsonType: ['objectId', 'string'] },
              tokenId: { bsonType: 'string' },
              refreshTokenHash: { bsonType: 'string' },
              deviceName: { bsonType: 'string' },
              deviceType: { enum: ['desktop', 'mobile', 'tablet'] },
              deviceInfo: {
                bsonType: 'object',
                required: ['os', 'browser', 'ipAddress', 'userAgent'],
                properties: {
                  os: { bsonType: 'string' },
                  browser: { bsonType: 'string' },
                  ipAddress: { bsonType: 'string' },
                  userAgent: { bsonType: 'string' }
                }
              },
              lastActivity: { bsonType: 'date' },
              createdAt: { bsonType: 'date' },
              expiresAt: { bsonType: 'date' },
              revoked: { bsonType: 'bool' },
              revokedAt: { bsonType: ['date', 'null'] }
            }
          }
        }
      });
      console.log('✅ Sessions collection created');
    } catch (error: any) {
      if (error.code === 48) {
        console.log('⚠️  Sessions collection already exists, skipping...');
      } else {
        throw error;
      }
    }

    // ============================================
    // Level 4: Audit Logs Collection
    // ============================================
    console.log('\n📝 Setting up audit_logs collection...');
    
    try {
      await db.createCollection('audit_logs', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['userId', 'sessionId', 'action', 'encrypted', 'ipAddress', 'userAgent', 'deviceInfo', 'timestamp'],
            properties: {
              userId: { bsonType: ['objectId', 'string'] },
              sessionId: { bsonType: 'string' },
              action: {
                enum: ['view', 'edit', 'delete', 'create', 'export', 'import', 
                       'login', 'logout', 'password_change', '2fa_enabled', 
                       '2fa_disabled', 'session_revoked', 'backup', 'restore']
              },
              itemId: { bsonType: ['objectId', 'string', 'null'] },
              itemType: { bsonType: ['string', 'null'] },
              encrypted: { bsonType: 'bool' },
              ipAddress: { bsonType: 'string' },
              userAgent: { bsonType: 'string' },
              deviceInfo: {
                bsonType: 'object',
                required: ['name', 'type', 'os'],
                properties: {
                  name: { bsonType: 'string' },
                  type: { bsonType: 'string' },
                  os: { bsonType: 'string' }
                }
              },
              timestamp: { bsonType: 'date' },
              metadata: { bsonType: ['object', 'null'] }
            }
          }
        }
      });
      console.log('✅ Audit_logs collection created');
    } catch (error: any) {
      if (error.code === 48) {
        console.log('⚠️  Audit_logs collection already exists, skipping...');
      } else {
        throw error;
      }
    }

    // ============================================
    // Level 5: Security Events Collection
    // ============================================
    console.log('\n📝 Setting up security_events collection...');
    
    try {
      await db.createCollection('security_events', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['type', 'severity', 'description', 'ipAddress', 'userAgent', 'timestamp', 'resolved'],
            properties: {
              userId: { bsonType: ['objectId', 'string', 'null'] },
              type: {
                enum: ['failed_login', 'suspicious_activity', 'breach_detected', 
                       'password_change', '2fa_enabled', 'session_revoked', 
                       'rate_limit_exceeded', 'invalid_token', 'account_locked']
              },
              severity: { enum: ['low', 'medium', 'high', 'critical'] },
              description: { bsonType: 'string' },
              ipAddress: { bsonType: 'string' },
              userAgent: { bsonType: 'string' },
              metadata: { bsonType: ['object', 'null'] },
              timestamp: { bsonType: 'date' },
              resolved: { bsonType: 'bool' },
              resolvedAt: { bsonType: ['date', 'null'] },
              resolvedBy: { bsonType: ['objectId', 'string', 'null'] }
            }
          }
        }
      });
      console.log('✅ Security_events collection created');
    } catch (error: any) {
      if (error.code === 48) {
        console.log('⚠️  Security_events collection already exists, skipping...');
      } else {
        throw error;
      }
    }

    // ============================================
    // Level 5: Password Breaches Cache Collection
    // ============================================
    console.log('\n📝 Setting up password_breaches collection...');
    
    try {
      await db.createCollection('password_breaches', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['hashPrefix', 'breachCount', 'lastChecked'],
            properties: {
              hashPrefix: { 
                bsonType: 'string',
                pattern: '^[0-9a-fA-F]{5}$'
              },
              breachCount: { bsonType: 'int', minimum: 0 },
              lastChecked: { bsonType: 'date' },
              checkedHashes: { bsonType: ['array', 'null'] }
            }
          }
        }
      });
      console.log('✅ Password_breaches collection created');
    } catch (error: any) {
      if (error.code === 48) {
        console.log('⚠️  Password_breaches collection already exists, skipping...');
      } else {
        throw error;
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('📌 Next step: Run 002-setup-indexes.ts to create all indexes');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run migration if executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('\n✨ Migration script finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Migration script failed:', error);
      process.exit(1);
    });
}

export default runMigration;

