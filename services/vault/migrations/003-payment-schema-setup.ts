/**
 * Migration 003: Payment Schema Setup
 * 
 * Creates indexes and initial setup for payment-related collections:
 * - subscriptions
 * - payment_orders
 * - coupons
 * 
 * Run this script after setting up the basic schema:
 * npm run migrate:payments
 */

import { MongoClient } from 'mongodb';
import { DBCONFIG } from '../config/config';

const dbConfig = DBCONFIG.vault;
const uri = dbConfig.uri;
const dbName = dbConfig.databaseName;
const collections = DBCONFIG.vault.collections;

/**
 * Main migration function
 */
async function runMigration() {
  const clientOptions = {
    serverSelectionTimeoutMS: 30000, // 30 seconds
    socketTimeoutMS: 45000, // 45 seconds
    connectTimeoutMS: 30000, // 30 seconds
    retryWrites: true,
    retryReads: true,
  };

  const client = new MongoClient(uri, clientOptions);

  try {
    console.log('🔄 Connecting to MongoDB...');
    console.log(`   Database: ${dbName}`);
    console.log(`   Host: ${uri.split('@')[1]?.split('/')[0] || 'connecting...'}`);
    
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    console.log('✅ Connected to MongoDB');

    const db = client.db(dbName);

    console.log('\n📊 Starting migration 003: Payment schema setup');

    // ============================================
    // Subscriptions Collection Indexes
    // ============================================
    console.log('\n📝 Creating indexes for subscriptions collection...');
    const subscriptionsCollection = db.collection(collections.subscriptions);

    try {
      await subscriptionsCollection.createIndex({ userId: 1 }, { name: 'idx_userId' });
      console.log('✅ subscriptions.userId');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  subscriptions.userId (may already exist)');
    }

    try {
      await subscriptionsCollection.createIndex({ status: 1 }, { name: 'idx_status' });
      console.log('✅ subscriptions.status');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  subscriptions.status (may already exist)');
    }

    try {
      await subscriptionsCollection.createIndex({ currentPeriodEnd: 1 }, { name: 'idx_periodEnd' });
      console.log('✅ subscriptions.currentPeriodEnd');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  subscriptions.currentPeriodEnd (may already exist)');
    }

    try {
      await subscriptionsCollection.createIndex({ payuSubscriptionId: 1 }, { name: 'idx_payuSubscriptionId', sparse: true });
      console.log('✅ subscriptions.payuSubscriptionId (sparse)');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  subscriptions.payuSubscriptionId (may already exist)');
    }

    try {
      await subscriptionsCollection.createIndex({ userId: 1, status: 1 }, { name: 'idx_userId_status' });
      console.log('✅ subscriptions.userId + status (compound)');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  subscriptions.userId + status (may already exist)');
    }

    // TTL index for expired subscriptions
    try {
      await subscriptionsCollection.createIndex(
        { expiresAt: 1 },
        {
          name: 'idx_expiresAt_ttl',
          expireAfterSeconds: 7776000, // 90 days
          partialFilterExpression: { status: 'expired' },
        }
      );
      console.log('✅ subscriptions.expiresAt (TTL, 90 days)');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  subscriptions.expiresAt TTL (may already exist)');
    }

    // ============================================
    // Payment Orders Collection Indexes
    // ============================================
    console.log('\n📝 Creating indexes for payment_orders collection...');
    const paymentOrdersCollection = db.collection(collections.paymentOrders);

    try {
      await paymentOrdersCollection.createIndex({ orderId: 1 }, { name: 'idx_orderId', unique: true });
      console.log('✅ payment_orders.orderId (unique)');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  payment_orders.orderId (may already exist)');
    }

    try {
      await paymentOrdersCollection.createIndex({ userId: 1 }, { name: 'idx_userId' });
      console.log('✅ payment_orders.userId');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  payment_orders.userId (may already exist)');
    }

    try {
      await paymentOrdersCollection.createIndex({ status: 1 }, { name: 'idx_status' });
      console.log('✅ payment_orders.status');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  payment_orders.status (may already exist)');
    }

    try {
      await paymentOrdersCollection.createIndex({ payuTransactionId: 1 }, { name: 'idx_payuTransactionId', sparse: true });
      console.log('✅ payment_orders.payuTransactionId (sparse)');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  payment_orders.payuTransactionId (may already exist)');
    }

    try {
      await paymentOrdersCollection.createIndex({ subscriptionId: 1 }, { name: 'idx_subscriptionId', sparse: true });
      console.log('✅ payment_orders.subscriptionId (sparse)');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  payment_orders.subscriptionId (may already exist)');
    }

    try {
      await paymentOrdersCollection.createIndex({ createdAt: 1 }, { name: 'idx_createdAt' });
      console.log('✅ payment_orders.createdAt');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  payment_orders.createdAt (may already exist)');
    }

    try {
      await paymentOrdersCollection.createIndex({ expiresAt: 1 }, { name: 'idx_expiresAt' });
      console.log('✅ payment_orders.expiresAt');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  payment_orders.expiresAt (may already exist)');
    }

    try {
      await paymentOrdersCollection.createIndex({ userId: 1, status: 1 }, { name: 'idx_userId_status' });
      console.log('✅ payment_orders.userId + status (compound)');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  payment_orders.userId + status (may already exist)');
    }

    // TTL index for expired orders
    try {
      await paymentOrdersCollection.createIndex(
        { expiresAt: 1 },
        {
          name: 'idx_expiresAt_ttl',
          expireAfterSeconds: 2592000, // 30 days
          partialFilterExpression: { status: { $in: ['pending', 'failed', 'cancelled'] } },
        }
      );
      console.log('✅ payment_orders.expiresAt (TTL, 30 days)');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  payment_orders.expiresAt TTL (may already exist)');
    }

    // ============================================
    // Coupons Collection Indexes
    // ============================================
    console.log('\n📝 Creating indexes for coupons collection...');
    const couponsCollection = db.collection(collections.coupons);

    try {
      await couponsCollection.createIndex({ code: 1 }, { name: 'idx_code', unique: true });
      console.log('✅ coupons.code (unique)');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  coupons.code (may already exist)');
    }

    try {
      await couponsCollection.createIndex({ isActive: 1 }, { name: 'idx_isActive' });
      console.log('✅ coupons.isActive');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  coupons.isActive (may already exist)');
    }

    try {
      await couponsCollection.createIndex({ validFrom: 1, validUntil: 1 }, { name: 'idx_validity' });
      console.log('✅ coupons.validFrom + validUntil (compound)');
    } catch (error: any) {
      if (error.code !== 85) console.log('⚠️  coupons.validity (may already exist)');
    }

    console.log('\n✅ Migration 003 completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   - Subscriptions indexes created');
    console.log('   - Payment orders indexes created');
    console.log('   - Coupons indexes created');
    console.log('   - TTL indexes configured for auto-cleanup');

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    
    if (error.message?.includes('timeout') || error.message?.includes('PoolClearedError')) {
      console.error('\n💡 Troubleshooting tips:');
      console.error('   1. Check your MongoDB connection string in config/config.ts');
      console.error('   2. Verify MongoDB is running and accessible');
      console.error('   3. Check your network connection');
      console.error('   4. Verify firewall allows connections to MongoDB');
      console.error('   5. For MongoDB Atlas: Check IP whitelist and network access');
      console.error('   6. Try running the migration again after a few seconds');
    }
    
    throw error;
  } finally {
    try {
      await client.close();
      console.log('\n🔌 Database connection closed');
    } catch (closeError) {
      // Ignore close errors
    }
  }
}

// Run migration if executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('\n✨ Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Migration failed:', error);
      process.exit(1);
    });
}

export { runMigration };

