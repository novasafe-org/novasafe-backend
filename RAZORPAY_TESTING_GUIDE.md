# Razorpay Payment Flow Testing Guide

## ✅ Prerequisites Checklist

### 1. Backend Environment Variables

Add these to your `.env` file in `services/vault/`:

```env
# Razorpay Test Credentials (Get from https://dashboard.razorpay.com/app/keys)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_ENVIRONMENT=sandbox

# Webhook Secret (Get from Razorpay Dashboard > Settings > Webhooks)
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Backend URL (Update with your actual backend URL)
BACKEND_URL=http://localhost:3123
# or for production:
# BACKEND_URL=https://your-backend-domain.com

# Callback URLs (Razorpay will redirect here after payment)
RAZORPAY_SUCCESS_URL=http://localhost:3123/v/payments/success
RAZORPAY_FAILURE_URL=http://localhost:3123/v/payments/failure
RAZORPAY_WEBHOOK_URL=http://localhost:3123/v/payments/webhook/razorpay

# For production, use ngrok or your public URL:
# RAZORPAY_WEBHOOK_URL=https://your-backend-domain.com/v/payments/webhook/razorpay
```

### 2. Get Razorpay Test Credentials

1. **Sign up/Login** to Razorpay Dashboard: https://dashboard.razorpay.com
2. **Go to Settings > API Keys**
3. **Generate Test Keys** (or use existing test keys)
4. Copy `Key ID` and `Key Secret`

### 3. Frontend Setup

#### Install Razorpay React Native SDK:

```bash
cd D:\1\Codec\Projects\NovaSafe
npm install react-native-razorpay
# or
yarn add react-native-razorpay
```

#### For iOS (if needed):
```bash
cd ios && pod install && cd ..
```

#### For Android:
- No additional setup needed (auto-linked)

### 4. Configure Webhook (Important!)

1. **Go to Razorpay Dashboard > Settings > Webhooks**
2. **Add Webhook URL**: `http://your-backend-url/v/payments/webhook/razorpay`
   - For local testing, use **ngrok**: `ngrok http 3123`
   - Copy the ngrok URL: `https://xxxxx.ngrok.io/v/payments/webhook/razorpay`
3. **Select Events**:
   - `payment.captured`
   - `payment.failed`
   - `subscription.activated`
   - `subscription.charged`
   - `subscription.cancelled`
4. **Copy Webhook Secret** and add to `.env`

---

## 🧪 Testing Steps

### Step 1: Start Backend Server

```bash
cd D:\1\Codec\Projects\vault-backend\services\vault
npm run dev
```

Verify server is running on `http://localhost:3123`

### Step 2: Test Backend Endpoints

#### Test 1: Create Payment Order

```bash
# Replace YOUR_AUTH_TOKEN with actual JWT token
curl -X POST http://localhost:3123/v/payments/create-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "planId": "pro",
    "period": "yearly",
    "currency": "INR",
    "country": "IN"
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
    "redirectUrl": "...",
    "provider": "razorpay",
    "razorpayOrderId": "order_xxxxxxxxxxxxx",
    "razorpayKeyId": "rzp_test_xxxxxxxxxxxxx",
    "expiresAt": "2024-01-15T11:00:00.000Z"
  }
}
```

#### Test 2: Verify Payment Status

```bash
curl -X GET "http://localhost:3123/v/payments/status?orderId=ORD_1234567890_abc123" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

### Step 3: Test Frontend Flow

1. **Open your React Native app**
2. **Navigate to Pricing Screen**
3. **Select a plan** (e.g., Pro - Yearly)
4. **Click "Get Full Access"**
5. **Razorpay Checkout should open** (native SDK or web fallback)

### Step 4: Test Payment with Test Cards

Razorpay provides test cards for testing:

#### Success Cards:
- **Card Number**: `4111 1111 1111 1111`
- **CVV**: Any 3 digits (e.g., `123`)
- **Expiry**: Any future date (e.g., `12/25`)
- **Name**: Any name

#### Failure Cards:
- **Card Number**: `4000 0000 0000 0002`
- **CVV**: Any 3 digits
- **Expiry**: Any future date

#### 3D Secure Test:
- **Card Number**: `4012 0010 3714 1112`
- **CVV**: `123`
- **Expiry**: `12/25`
- **OTP**: `1234` (for 3D Secure)

### Step 5: Verify Webhook (Important!)

1. **Use ngrok** to expose your local backend:
   ```bash
   ngrok http 3123
   ```

2. **Update webhook URL** in Razorpay Dashboard with ngrok URL

3. **Make a test payment** and check:
   - Backend logs for webhook received
   - Database for payment order status updated
   - Subscription created (if applicable)

---

## 🔍 Verification Checklist

After completing a test payment, verify:

- [ ] Payment order created in database
- [ ] Razorpay order created (check Razorpay Dashboard)
- [ ] Payment status updated to `completed`
- [ ] Subscription created (if recurring)
- [ ] Webhook received and processed
- [ ] Frontend receives success callback
- [ ] User subscription status updated

---

## 🐛 Troubleshooting

### Issue: "Razorpay key ID not configured"
**Solution**: Check `RAZORPAY_KEY_ID` in `.env` file

### Issue: "Payment order creation failed"
**Solution**: 
- Verify Razorpay credentials are correct
- Check backend logs for detailed error
- Ensure `RAZORPAY_ENVIRONMENT=sandbox` for testing

### Issue: "Webhook not received"
**Solution**:
- Use ngrok for local testing
- Verify webhook URL in Razorpay Dashboard
- Check `RAZORPAY_WEBHOOK_SECRET` matches dashboard
- Check backend logs for webhook endpoint

### Issue: "Razorpay SDK not available"
**Solution**:
- Install `react-native-razorpay` package
- For iOS: Run `pod install`
- Check if SDK is properly linked

### Issue: "Payment verification failed"
**Solution**:
- Verify webhook signature secret matches
- Check payment order exists in database
- Verify Razorpay order ID matches

---

## 📝 Test Scenarios

### Scenario 1: Successful One-Time Payment
1. Create order for `one_time` period
2. Complete payment with success card
3. Verify order status = `completed`
4. Verify subscription created

### Scenario 2: Failed Payment
1. Create order
2. Use failure test card
3. Verify order status = `failed`
4. Verify error message stored

### Scenario 3: Payment Cancellation
1. Create order
2. Cancel payment in Razorpay checkout
3. Verify order status = `cancelled` or `pending`

### Scenario 4: Recurring Subscription
1. Create order for `monthly` or `yearly` period
2. Complete payment
3. Verify subscription created with recurring status
4. Verify webhook for `subscription.activated`

---

## 🚀 Production Checklist

Before going live:

- [ ] Switch to production Razorpay keys
- [ ] Set `RAZORPAY_ENVIRONMENT=production`
- [ ] Update webhook URL to production domain
- [ ] Test with real payment (small amount)
- [ ] Verify webhook signature validation
- [ ] Set up monitoring/alerts for payment failures
- [ ] Test subscription renewal flow
- [ ] Verify refund handling (if needed)

---

## 📚 Additional Resources

- Razorpay Docs: https://razorpay.com/docs/
- Razorpay Test Cards: https://razorpay.com/docs/payments/test-cards/
- React Native SDK: https://github.com/razorpay/react-native-razorpay
- Webhook Guide: https://razorpay.com/docs/webhooks/

---

## ✅ Quick Test Command

```bash
# Test payment order creation (replace tokens)
curl -X POST http://localhost:3123/v/payments/create-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"planId":"pro","period":"yearly","currency":"INR","country":"IN"}' | jq
```

---

**Note**: Always test in sandbox mode first before using production credentials!

