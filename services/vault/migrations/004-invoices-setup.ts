/**
 * Migration 004: Invoices Collection Setup
 *
 * Creates indexes for the invoices collection (invoice management).
 * Run: npx ts-node --require tsconfig-paths/register migrations/004-invoices-setup.ts
 */

import { MongoClient } from 'mongodb';
import { DBCONFIG } from '../config/config';

const dbConfig = DBCONFIG.vault;
const uri = dbConfig.uri;
const dbName = dbConfig.databaseName;
const collections = DBCONFIG.vault.collections;

async function runMigration() {
  const client = new MongoClient(uri!, { retryWrites: true });
  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collections.invoices);

    await col.createIndex({ workspaceId: 1, issuedAt: -1 }, { name: 'idx_workspace_issued' });
    await col.createIndex({ razorpayPaymentId: 1 }, { name: 'idx_razorpay_payment_id', sparse: true });
    await col.createIndex({ razorpayOrderId: 1 }, { name: 'idx_razorpay_order_id', sparse: true });
    await col.createIndex({ invoiceNumber: 1 }, { name: 'idx_invoice_number', unique: true });

    console.log('✅ Migration 004: Invoices indexes created');
  } finally {
    await client.close();
  }
}

runMigration().catch((e) => {
  console.error(e);
  process.exit(1);
});
