# Payment Schema Migration Instructions

## How to Run Migration 003

### Method 1: Using npm script (Recommended)

```bash
cd services/vault
npm run migrate:payments
```

### Method 2: Direct execution with ts-node

```bash
cd services/vault
npx ts-node --require tsconfig-paths/register migrations/003-payment-schema-setup.ts
```

## What the Migration Does

The migration creates indexes for three new collections:

1. **subscriptions** - User subscription records
2. **payment_orders** - Payment transaction records  
3. **coupons** - Discount coupon records

### Indexes Created:

#### Subscriptions:
- `userId` - For fast user lookup
- `status` - For filtering by subscription status
- `currentPeriodEnd` - For finding expiring subscriptions
- `payuSubscriptionId` - For PayU recurring payment lookup (sparse)
- `userId + status` - Compound index for common queries
- `expiresAt` - TTL index (auto-deletes expired subscriptions after 90 days)

#### Payment Orders:
- `orderId` - Unique index for order lookup
- `userId` - For user payment history
- `status` - For filtering by payment status
- `payuTransactionId` - For PayU transaction lookup (sparse)
- `subscriptionId` - For subscription reference (sparse)
- `createdAt` - For chronological queries
- `expiresAt` - For finding expired orders
- `userId + status` - Compound index for user payment queries
- `expiresAt` - TTL index (auto-deletes expired/failed orders after 30 days)

#### Coupons:
- `code` - Unique index for coupon lookup
- `isActive` - For filtering active coupons
- `validFrom + validUntil` - Compound index for validity checks

## Prerequisites

- MongoDB connection configured in `config/config.ts`
- Database accessible and running
- Collections will be created automatically on first insert (no need to create manually)

## Verification

After running migration, verify in MongoDB:

```javascript
// Check indexes were created
db.subscriptions.getIndexes()
db.payment_orders.getIndexes()
db.coupons.getIndexes()

// Verify collections exist (will be empty initially)
db.subscriptions.countDocuments()
db.payment_orders.countDocuments()
db.coupons.countDocuments()
```

## Troubleshooting

### Error: "Collection not found"
**Solution:** This is normal. Collections are created automatically when first document is inserted. The migration only creates indexes.

### Error: "Index already exists"
**Solution:** This is safe - MongoDB will skip existing indexes. The migration is idempotent.

### Error: Connection failed
**Solution:**
1. Check MongoDB connection string in `config/config.ts`
2. Verify MongoDB is running
3. Check network connectivity
4. Verify database credentials

## Rollback

If you need to rollback (remove indexes):

```javascript
// In MongoDB shell
db.subscriptions.dropIndexes()
db.payment_orders.dropIndexes()
db.coupons.dropIndexes()
```

**Note:** This will remove ALL indexes, including ones created by other migrations. Use with caution.

