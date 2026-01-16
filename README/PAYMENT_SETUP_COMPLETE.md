# Payment System Setup - Complete Guide

## ✅ What's Been Implemented

### Backend Components Created:

1. **Models** (`src/models/`):
   - `Subscription.ts` - Subscription data model
   - `PaymentOrder.ts` - Payment transaction model
   - `Coupon.ts` - Discount coupon model

2. **Services** (`src/services/`):
   - `payuService.ts` - PayU gateway integration
   - `paymentService.ts` - Payment order management
   - `subscriptionService.ts` - Subscription lifecycle
   - `couponService.ts` - Coupon validation
   - `pricingConfigService.ts` - Pricing configuration

3. **Controllers** (`src/controllers/`):
   - `PaymentController.ts` - Payment HTTP handlers
   - `SubscriptionController.ts` - Subscription HTTP handlers
   - `PricingController.ts` - Pricing HTTP handlers

4. **Routes** (`src/routes/`):
   - `paymentRoute.ts` - Payment endpoints
   - `subscriptionRoute.ts` - Subscription endpoints
   - `pricingRoute.ts` - Pricing endpoints

5. **Configuration**:
   - PayU config added to `config/config.ts`
   - Environment variables documented in `env.example`
   - Database collections added to config

6. **Migration**:
   - `003-payment-schema-setup.ts` - Creates indexes for payment collections

## 🚀 Step-by-Step Setup

### Step 1: Install Dependencies

```bash
cd services/vault
npm install axios
```

### Step 2: Configure Environment Variables

Add to `.env` file:

```env
# PayU Configuration
PAYU_MERCHANT_ID=your_merchant_id_from_payu_dashboard
PAYU_MERCHANT_KEY=your_merchant_key_from_payu_dashboard
PAYU_MERCHANT_SALT=your_merchant_salt_from_payu_dashboard
PAYU_BASE_URL=https://secure.payu.in
PAYU_API_URL=https://secure.payu.in/api/v2
PAYU_ENVIRONMENT=sandbox
PAYU_ENABLE_RECURRING=true
PAYU_SUCCESS_URL=http://YOUR_IP:3123/v/payments/callback
PAYU_FAILURE_URL=http://YOUR_IP:3123/v/payments/callback
PAYU_PAYMENT_TIMEOUT=1800
PAYU_ORDER_EXPIRY_MINUTES=30
```

**Important:** 
- For **sandbox/testing**: Use sandbox credentials from PayU dashboard
- For **production**: Use production credentials and update `PAYU_ENVIRONMENT=production`
- Update `YOUR_IP` with your server's IP address (or use ngrok for local testing)

### Step 3: Run Migration

```bash
cd services/vault
npm run migrate:payments
```

**Expected Output:**
```
✅ Connected to MongoDB
📊 Starting migration 003: Payment schema setup
📝 Creating indexes for subscriptions collection...
✅ subscriptions.userId
✅ subscriptions.status
...
✨ Migration completed successfully!
```

### Step 4: Start Backend Server

```bash
npm run dev
```

Verify server starts without errors.

## 🧪 Testing Payment Flow

### Test 1: Get Pricing Plans (No Auth Required)

```bash
curl http://localhost:3123/v/pricing/plans?currency=INR
```

**Expected:** List of pricing plans

### Test 2: Authenticate User

```bash
curl -X POST http://localhost:3123/v/auth/google \
  -H "Content-Type: application/json" \
  -d '{"credential": "YOUR_GOOGLE_ID_TOKEN"}'
```

**Save the `token` from response for next requests.**

### Test 3: Create Payment Order

```bash
curl -X POST http://localhost:3123/v/payments/create-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "planId": "pro",
    "period": "yearly",
    "currency": "INR"
  }'
```

**Expected Response:**
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

### Test 4: Complete Payment in PayU Sandbox

1. **Copy `redirectUrl`** from create-order response
2. **Open in browser**
3. **Use PayU test card**:
   - Card Number: `5123456789012346` (or check PayU docs for latest test cards)
   - CVV: `123`
   - Expiry: Any future date (e.g., `12/25`)
   - Name: Any name
4. **Complete payment**

### Test 5: Check Payment Status

```bash
curl "http://localhost:3123/v/payments/status?orderId=ORD_1234567890_abc123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected:** Status should be "completed" after payment

### Test 6: Verify Subscription Created

```bash
curl http://localhost:3123/v/subscriptions/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected:** Subscription with planId "pro" and status "active"

## 📱 Frontend Testing

### Update Backend URL

In `NovaSafe/config/backend.ts`:
```typescript
return 'http://YOUR_SERVER_IP:3123/v';
```

### Test Flow:
1. Open app → Navigate to Pricing screen
2. Select "Pro" plan → Yearly
3. Click "Get Full Access"
4. Should redirect to PayU checkout
5. Complete payment with test card
6. Return to app → Verify "Current Plan" badge appears on Pro plan

## 🔍 PayU Dashboard Configuration

### For Sandbox Testing:

1. **Login to PayU Dashboard**: https://dashboard.payu.in/
2. **Go to Settings → API Credentials**
3. **Copy Sandbox credentials**:
   - Merchant ID
   - Merchant Key
   - Merchant Salt
4. **Add to `.env` file**

### For Production:

1. **Switch to Production account**
2. **Update credentials in `.env`**
3. **Set `PAYU_ENVIRONMENT=production`**
4. **Configure Webhook URLs** in PayU dashboard:
   - Success URL: `https://yourdomain.com/v/payments/callback`
   - Failure URL: `https://yourdomain.com/v/payments/callback`

## 🐛 Common Issues & Solutions

### Issue 1: Migration fails with connection error
**Solution:** 
- Check MongoDB connection string in `config/config.ts`
- Verify MongoDB is running
- Check network connectivity

### Issue 2: PayU returns "Invalid hash"
**Solution:**
- Verify `PAYU_MERCHANT_SALT` matches PayU dashboard exactly
- Check hash generation algorithm matches PayU's requirements
- Ensure all parameters are included in hash calculation

### Issue 3: Payment callback not received
**Solution:**
- For local testing: Use ngrok to expose localhost
  ```bash
  ngrok http 3123
  ```
- Update PayU webhook URL to ngrok URL
- Or manually test callback endpoint

### Issue 4: Subscription not created after payment
**Solution:**
- Check backend logs for errors
- Verify payment status is "completed"
- Check PayU callback was received
- Verify user authentication

### Issue 5: "Collection not found" error
**Solution:** This is normal - collections are created automatically on first insert. Migration only creates indexes.

## 📋 Testing Checklist

- [ ] Migration run successfully
- [ ] Backend server starts without errors
- [ ] Pricing plans endpoint works
- [ ] Payment order creation works
- [ ] PayU redirect URL is valid
- [ ] Payment completes in PayU sandbox
- [ ] Payment callback received
- [ ] Subscription created in database
- [ ] Subscription endpoint returns correct data
- [ ] Frontend shows "Current Plan" badge
- [ ] Error handling works correctly

## 📚 Additional Documentation

- **MIGRATION_INSTRUCTIONS.md** - Detailed migration guide
- **PAYMENT_TESTING_GUIDE.md** - Comprehensive testing scenarios
- **QUICK_START_PAYMENT.md** - Quick reference guide
- **PAYMENT_IMPLEMENTATION.md** - Technical implementation details

## 🎯 Next Steps After Testing

1. ✅ Test all payment scenarios
2. ✅ Test error cases
3. ✅ Test recurring payments
4. ✅ Test subscription cancellation
5. ✅ Test restore purchases
6. ✅ Set up production PayU account
7. ✅ Configure production webhooks
8. ✅ Set up monitoring and alerts
9. ✅ Test with real payment (small amount)
10. ✅ Go live! 🚀

## 📞 Support

If you encounter issues:
1. Check backend logs for detailed error messages
2. Verify PayU credentials are correct
3. Check MongoDB connection
4. Review PayU API documentation: https://devguide.payu.in/

