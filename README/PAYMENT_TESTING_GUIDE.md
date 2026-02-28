# Payment Flow Testing Guide

## Prerequisites

✅ **Completed:**
- [x] Environment variables configured in `.env`
- [x] PayU merchant account created
- [x] Migration 003 run successfully

## Step 1: Run Payment Schema Migration

### Option 1: Using npm script (Recommended)
```bash
cd services/vault
npm run migrate:payments
```

### Option 2: Direct execution
```bash
cd services/vault
npx ts-node --require tsconfig-paths/register migrations/003-payment-schema-setup.ts
```

### Expected Output:
```
✅ Connected to MongoDB
📊 Starting migration 003: Payment schema setup
📝 Creating indexes for subscriptions collection...
✅ subscriptions.userId
✅ subscriptions.status
...
✨ Migration completed successfully!
```

### Verify Migration:
1. Check MongoDB Compass/Atlas
2. Verify collections exist: `subscriptions`, `payment_orders`, `coupons`
3. Verify indexes are created (check `db.subscriptions.getIndexes()`)

## Step 2: Verify PayU Configuration

### Check Environment Variables:
```bash
# In services/vault directory
cat .env | grep PAYU
```

### Required Variables:
```env
PAYU_MERCHANT_ID=your_merchant_id
PAYU_MERCHANT_KEY=your_merchant_key
PAYU_MERCHANT_SALT=your_merchant_salt
PAYU_ENVIRONMENT=sandbox  # Use 'sandbox' for testing
PAYU_ENABLE_RECURRING=true
PAYU_SUCCESS_URL=http://localhost:5001/v/payments/callback
PAYU_FAILURE_URL=http://localhost:5001/v/payments/callback
```

### PayU Sandbox Test Credentials:
For testing, PayU provides test credentials. Check your PayU dashboard:
- **Test Merchant ID**: Usually provided in sandbox dashboard
- **Test Merchant Key**: Provided in sandbox dashboard
- **Test Merchant Salt**: Provided in sandbox dashboard

## Step 3: Start Backend Server

```bash
cd services/vault
npm run dev
```

### Verify Server Started:
```
✅ Database connected ✅
Vault service running on port 5001
```

## Step 4: Test Payment Flow

### 4.1 Test Pricing Endpoints (No Auth Required)

#### Get Pricing Plans:
```bash
curl http://localhost:5001/v/pricing/plans?currency=INR
```

**Expected Response:**
```json
{
  "plans": [
    {
      "id": "basic",
      "name": "Basic",
      "monthlyPrice": { "amount": 799, "currency": "INR" },
      "yearlyPrice": { "amount": 7999, "currency": "INR" }
    },
    ...
  ]
}
```

#### Get Pricing Config:
```bash
curl http://localhost:5001/v/pricing/config?currency=INR
```

### 4.2 Authenticate User (Required for Payment)

#### Google Sign-In:
```bash
curl -X POST http://localhost:5001/v/auth/google \
  -H "Content-Type: application/json" \
  -d '{
    "credential": "YOUR_GOOGLE_ID_TOKEN"
  }'
```

**Save the returned `token` for next requests.**

### 4.3 Create Payment Order

#### Request:
```bash
curl -X POST http://localhost:5001/v/payments/create-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "planId": "pro",
    "period": "yearly",
    "currency": "INR"
  }'
```

#### Expected Response:
```json
{
  "message": "Payment order created successfully",
  "order": {
    "orderId": "ORD_1234567890_abc123",
    "amount": 15999,
    "currency": "INR",
    "totalAmount": 18878.82,
    "redirectUrl": "https://secure.payu.in/...",
    "expiresAt": "2024-01-15T11:00:00.000Z"
  }
}
```

### 4.4 Test Payment Flow

#### Option A: Using PayU Sandbox Test Cards

1. **Copy `redirectUrl`** from the create-order response
2. **Open in browser** (or use Postman/curl)
3. **Use PayU test card**:
   - Card Number: `5123456789012346`
   - CVV: `123`
   - Expiry: Any future date (e.g., `12/25`)
   - Name: Any name

#### Option B: Using Postman

1. Create new request: `GET` to the `redirectUrl`
2. Follow redirects
3. Fill PayU test form
4. Complete payment

### 4.5 Verify Payment Status

#### Check Payment Status:
```bash
curl http://localhost:5001/v/payments/status?orderId=ORD_1234567890_abc123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Expected Response (After Payment):
```json
{
  "status": {
    "orderId": "ORD_1234567890_abc123",
    "status": "completed",
    "subscriptionId": "507f1f77bcf86cd799439011"
  }
}
```

### 4.6 Verify Subscription Created

#### Get User Subscription:
```bash
curl http://localhost:5001/v/subscriptions/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Expected Response:
```json
{
  "subscription": {
    "id": "507f1f77bcf86cd799439011",
    "planId": "pro",
    "status": "active",
    "billingPeriod": "yearly",
    "currentPeriodStart": "2024-01-15T10:00:00.000Z",
    "currentPeriodEnd": "2025-01-15T10:00:00.000Z"
  }
}
```

## Step 5: Test PayU Callback (Webhook)

### 5.1 Simulate PayU Callback

PayU will send a POST request to `/v/payments/callback` after payment.

#### Manual Test (Using curl):
```bash
curl -X POST http://localhost:5001/v/payments/callback \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD_1234567890_abc123",
    "txnid": "payu_txn_123",
    "status": "success",
    "amount": "18878.82",
    "productinfo": "pro - yearly",
    "firstname": "Test",
    "email": "test@example.com",
    "hash": "test_hash"
  }'
```

**Note:** In production, PayU will send this automatically. For testing, you may need to:
1. Use PayU's webhook testing tool
2. Or manually trigger after completing payment in sandbox

## Step 6: Test Frontend Integration

### 6.1 Update Frontend Backend URL

Ensure `config/backend.ts` points to your backend:
```typescript
return 'http://localhost:5001/v';  // or your server IP
```

### 6.2 Test in Mobile App

1. **Navigate to Pricing Screen**
2. **Select a plan** (e.g., Pro - Yearly)
3. **Click "Get Full Access"**
4. **Should redirect to PayU checkout**
5. **Complete payment with test card**
6. **Verify subscription shows "Current Plan" badge**

## Step 7: Test Error Scenarios

### 7.1 Test Invalid Plan
```bash
curl -X POST http://localhost:5001/v/payments/create-order \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "planId": "invalid_plan",
    "period": "yearly",
    "currency": "INR"
  }'
```
**Expected:** 400 Bad Request

### 7.2 Test Expired Order
Wait 30+ minutes, then check status:
```bash
curl http://localhost:5001/v/payments/status?orderId=EXPIRED_ORDER_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
**Expected:** Order should be expired

### 7.3 Test Payment Failure
Use PayU test card that fails (check PayU docs for test cards that fail)

## Step 8: Monitor Logs

### Backend Logs:
Watch server console for:
- Payment order creation
- PayU API calls
- Payment verification
- Subscription creation

### Common Log Messages:
```
Creating PayU payment order: ORD_123...
Payment completed for order ORD_123, subscription: 507f...
Error creating payment order: ...
```

## Step 9: Verify Database

### Check Collections:

#### Subscriptions:
```javascript
// In MongoDB shell or Compass
db.subscriptions.find().pretty()
```

#### Payment Orders:
```javascript
db.payment_orders.find().pretty()
```

#### Verify Indexes:
```javascript
db.subscriptions.getIndexes()
db.payment_orders.getIndexes()
db.coupons.getIndexes()
```

## Troubleshooting

### Issue: Migration fails with "Collection not found"
**Solution:** Collections are created automatically on first insert. This is normal.

### Issue: PayU returns "Invalid hash"
**Solution:** 
- Verify `PAYU_MERCHANT_SALT` is correct
- Check PayU dashboard for correct salt value
- Ensure hash generation matches PayU's algorithm

### Issue: Payment callback not received
**Solution:**
- For local testing, use ngrok to expose localhost
- Update PayU webhook URL to ngrok URL
- Or manually trigger callback for testing

### Issue: Subscription not created after payment
**Solution:**
- Check backend logs for errors
- Verify payment status is "completed"
- Check if PayU callback was received
- Verify user authentication

## Next Steps After Testing

1. ✅ **Set up production PayU account**
2. ✅ **Update environment variables for production**
3. ✅ **Configure production webhook URLs**
4. ✅ **Set up monitoring and alerts**
5. ✅ **Test recurring payment flow**
6. ✅ **Test subscription cancellation**
7. ✅ **Test restore purchases**

## PayU Sandbox Resources

- **PayU Dashboard**: https://dashboard.payu.in/
- **Test Cards**: Check PayU documentation for test card numbers
- **Webhook Testing**: Use PayU's webhook testing tool
- **API Documentation**: https://devguide.payu.in/

## Production Checklist

Before going live:
- [ ] Switch `PAYU_ENVIRONMENT` to `production`
- [ ] Update `PAYU_SUCCESS_URL` and `PAYU_FAILURE_URL` to production URLs
- [ ] Set up SSL certificates
- [ ] Configure production webhook URLs in PayU dashboard
- [ ] Test with real payment (small amount)
- [ ] Set up error monitoring (Sentry, etc.)
- [ ] Set up payment analytics
- [ ] Review security settings

