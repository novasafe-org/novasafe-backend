/**
 * Database Indexes Setup Script
 * 
 * Creates all required indexes for optimal query performance.
 * Includes high-priority, performance, and TTL indexes.
 * 
 * Run this script after 001-complete-schema-setup.ts
 */

import { MongoClient } from 'mongodb';
import { DBCONFIG } from '../config/config';

const dbConfig = DBCONFIG.vault;
const uri = dbConfig.uri;
const dbName = dbConfig.databaseName;

/**
 * Main index setup function
 */
async function setupIndexes() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(dbName);

    // ============================================
    // High-Priority Indexes (Create First)
    // ============================================
    console.log('\n📊 Creating high-priority indexes...');

    // Users Collection - High Priority
    const usersCollection = db.collection('users');
    
    await usersCollection.createIndex({ googleId: 1 }, { unique: true, name: 'idx_users_googleId_unique' });
    console.log('✅ users.googleId (unique)');

    await usersCollection.createIndex({ email: 1 }, { unique: true, name: 'idx_users_email_unique' });
    console.log('✅ users.email (unique)');

    await usersCollection.createIndex({ encryptionSalt: 1 }, { sparse: true, name: 'idx_users_encryptionSalt' });
    console.log('✅ users.encryptionSalt (sparse)');

    await usersCollection.createIndex({ accountLockedUntil: 1 }, { sparse: true, name: 'idx_users_accountLockedUntil' });
    console.log('✅ users.accountLockedUntil (sparse)');

    await usersCollection.createIndex({ totpEnabled: 1 }, { name: 'idx_users_totpEnabled' });
    console.log('✅ users.totpEnabled');

    // Vault Items Collection - High Priority
    const vaultItemsCollection = db.collection('vaultItems');
    
    await vaultItemsCollection.createIndex({ userId: 1, category: 1 }, { name: 'idx_vaultItems_userId_category' });
    console.log('✅ vaultItems.userId + category');

    await vaultItemsCollection.createIndex({ userId: 1, folderId: 1 }, { sparse: true, name: 'idx_vaultItems_userId_folderId' });
    console.log('✅ vaultItems.userId + folderId (sparse)');

    await vaultItemsCollection.createIndex({ userId: 1, createdAt: -1 }, { name: 'idx_vaultItems_userId_createdAt' });
    console.log('✅ vaultItems.userId + createdAt (desc)');

    await vaultItemsCollection.createIndex({ userId: 1, encrypted_data: 1 }, { sparse: true, name: 'idx_vaultItems_userId_encryptedData' });
    console.log('✅ vaultItems.userId + encrypted_data (sparse)');

    // Sessions Collection - High Priority
    const sessionsCollection = db.collection('sessions');
    
    await sessionsCollection.createIndex({ tokenId: 1 }, { unique: true, name: 'idx_sessions_tokenId_unique' });
    console.log('✅ sessions.tokenId (unique)');

    await sessionsCollection.createIndex({ userId: 1, revoked: 1 }, { name: 'idx_sessions_userId_revoked' });
    console.log('✅ sessions.userId + revoked');

    await sessionsCollection.createIndex({ refreshTokenHash: 1 }, { unique: true, name: 'idx_sessions_refreshTokenHash_unique' });
    console.log('✅ sessions.refreshTokenHash (unique)');

    // ============================================
    // Performance Indexes (Create After)
    // ============================================
    console.log('\n📊 Creating performance indexes...');

    // Audit Logs Collection
    const auditLogsCollection = db.collection('audit_logs');
    
    await auditLogsCollection.createIndex({ userId: 1, timestamp: -1 }, { name: 'idx_auditLogs_userId_timestamp' });
    console.log('✅ audit_logs.userId + timestamp (desc)');

    await auditLogsCollection.createIndex({ userId: 1, action: 1, timestamp: -1 }, { name: 'idx_auditLogs_userId_action_timestamp' });
    console.log('✅ audit_logs.userId + action + timestamp (desc)');

    await auditLogsCollection.createIndex({ itemId: 1, timestamp: -1 }, { sparse: true, name: 'idx_auditLogs_itemId_timestamp' });
    console.log('✅ audit_logs.itemId + timestamp (sparse)');

    await auditLogsCollection.createIndex({ sessionId: 1, timestamp: -1 }, { name: 'idx_auditLogs_sessionId_timestamp' });
    console.log('✅ audit_logs.sessionId + timestamp (desc)');

    // Security Events Collection
    const securityEventsCollection = db.collection('security_events');
    
    await securityEventsCollection.createIndex({ userId: 1, timestamp: -1 }, { sparse: true, name: 'idx_securityEvents_userId_timestamp' });
    console.log('✅ security_events.userId + timestamp (sparse)');

    await securityEventsCollection.createIndex({ type: 1, timestamp: -1 }, { name: 'idx_securityEvents_type_timestamp' });
    console.log('✅ security_events.type + timestamp (desc)');

    await securityEventsCollection.createIndex({ severity: 1, resolved: 1, timestamp: -1 }, { name: 'idx_securityEvents_severity_resolved_timestamp' });
    console.log('✅ security_events.severity + resolved + timestamp (desc)');

    // Password Breaches Collection
    const passwordBreachesCollection = db.collection('password_breaches');
    
    await passwordBreachesCollection.createIndex({ hashPrefix: 1 }, { unique: true, name: 'idx_passwordBreaches_hashPrefix_unique' });
    console.log('✅ password_breaches.hashPrefix (unique)');

    // Folders Collection
    const foldersCollection = db.collection('folders');
    
    await foldersCollection.createIndex({ userId: 1, createdAt: -1 }, { name: 'idx_folders_userId_createdAt' });
    console.log('✅ folders.userId + createdAt (desc)');

    await foldersCollection.createIndex({ userId: 1, accessCount: -1 }, { name: 'idx_folders_userId_accessCount' });
    console.log('✅ folders.userId + accessCount (desc)');

    // Sessions Collection - Performance
    await sessionsCollection.createIndex({ userId: 1, createdAt: -1 }, { name: 'idx_sessions_userId_createdAt' });
    console.log('✅ sessions.userId + createdAt (desc)');

    // ============================================
    // TTL Indexes (Auto-cleanup)
    // ============================================
    console.log('\n📊 Creating TTL indexes for auto-cleanup...');

    // Sessions: Auto-delete after 30 days
    await sessionsCollection.createIndex(
      { expiresAt: 1 },
      { 
        expireAfterSeconds: 0,
        name: 'ttl_sessions_expiresAt_30days'
      }
    );
    console.log('✅ sessions.expiresAt (TTL: 30 days)');

    // Audit Logs: Auto-delete after 2 years (63072000 seconds)
    await auditLogsCollection.createIndex(
      { timestamp: 1 },
      {
        expireAfterSeconds: 63072000, // 2 years
        name: 'ttl_auditLogs_timestamp_2years'
      }
    );
    console.log('✅ audit_logs.timestamp (TTL: 2 years)');

    // Security Events: Auto-delete after 1 year (31536000 seconds)
    await securityEventsCollection.createIndex(
      { timestamp: 1 },
      {
        expireAfterSeconds: 31536000, // 1 year
        name: 'ttl_securityEvents_timestamp_1year'
      }
    );
    console.log('✅ security_events.timestamp (TTL: 1 year)');

    // Password Breaches: Auto-delete after 7 days (604800 seconds)
    await passwordBreachesCollection.createIndex(
      { lastChecked: 1 },
      {
        expireAfterSeconds: 604800, // 7 days
        name: 'ttl_passwordBreaches_lastChecked_7days'
      }
    );
    console.log('✅ password_breaches.lastChecked (TTL: 7 days)');

    console.log('\n✅ All indexes created successfully!');

  } catch (error) {
    console.error('❌ Index setup failed:', error);
    throw error;
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run setup if executed directly
if (require.main === module) {
  setupIndexes()
    .then(() => {
      console.log('\n✨ Index setup script finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Index setup script failed:', error);
      process.exit(1);
    });
}

export default setupIndexes;

