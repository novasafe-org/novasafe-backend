# Quick Start: Payment System Setup & Testing

## ✅ Prerequisites Checklist

- [x] PayU merchant account created
- [x] Environment variables configured
- [ ] Migration run successfully
- [ ] Backend server running
- [ ] Frontend connected to backend

## Step 1: Install Dependencies

```bash
cd services/vault
npm install axios
```

## Step 2: Run Payment Migration

```bash
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

## Step 3: Verify Environment Variables

Check your `.env` file has all PayU variables:

```bash
# In services/vault directory
cat .env | grep PAYU
```

**Required:**
- `PAYU_MERCHANT_ID`
- `PAYU_MERCHANT_KEY`
- `PAYU_MERCHANT_SALT`
- `PAYU_ENVIRONMENT=sandbox` (for testing)
- `PAYU_ENABLE_RECURRING=true`

## Step 4: Start Backend Server

```bash
npm run dev
```

**Verify:** Server should start without errors and show:
```
✅ Database connected ✅
Vault service running on port 3123
```

## Step 5: Test Payment Flow

### 5.1 Get Pricing Plans (No Auth)
```bash
curl http://localhost:3123/v/pricing/plans?currency=INR
```

### 5.2 Authenticate (Get JWT Token)
```bash
curl -X POST http://localhost:3123/v/auth/google \
  -H "Content-Type: application/json" \
  -d '{"credential": "YOUR_GOOGLE_ID_TOKEN"}'
```

**Save the `token` from response.**

### 5.3 Create Payment Order
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

**Copy the `redirectUrl` from response.**

### 5.4 Complete Payment
1. Open `redirectUrl` in browser
2. Use PayU test card:
   - Card: `5123456789012346`
   - CVV: `123`
   - Expiry: `12/25`
3. Complete payment

### 5.5 Check Payment Status
```bash
curl "http://localhost:3123/v/payments/status?orderId=ORD_XXX" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 5.6 Verify Subscription
```bash
curl http://localhost:3123/v/subscriptions/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Step 6: Test in Mobile App

1. **Update backend URL** in `NovaSafe/config/backend.ts`:
   ```typescript
   return 'http://YOUR_IP:3123/v';  // Your server IP
   ```

2. **Open app** → Navigate to Pricing screen
3. **Select plan** → Click "Get Full Access"
4. **Complete payment** → Verify "Current Plan" badge appears

## Troubleshooting

### Migration fails
- Check MongoDB connection in `config/config.ts`
- Verify database name is correct
- Check MongoDB is running

### PayU errors
- Verify `PAYU_MERCHANT_SALT` matches PayU dashboard
- Check `PAYU_ENVIRONMENT` is `sandbox` for testing
- Verify merchant credentials are correct

### Payment callback not working
- For local testing, use ngrok: `ngrok http 3123`
- Update PayU webhook URL to ngrok URL
- Or manually test callback endpoint

## Next Steps

See `PAYMENT_TESTING_GUIDE.md` for detailed testing scenarios.

