# PayU Payment Gateway Integration Guide

## Overview

This document provides comprehensive documentation for the PayU payment gateway integration in NovaSafe. The implementation supports:

- ✅ One-time payments
- ✅ Recurring payments / subscriptions
- ✅ Restore purchase logic
- ✅ Payment verification and webhook handling
- ✅ International payments/cross-border support (India via PayU)
- ✅ Proper error flows and logging
- ✅ Secure hash generation and verification
- ✅ Clear success/failure callbacks and navigation

## Architecture

### Payment Provider Abstraction

The implementation uses a **pluggable payment provider architecture** that allows easy integration of multiple payment gateways:

```
payment/
├── types.ts              # Common interfaces and types
├── paymentRouter.ts      # Routes requests to appropriate provider
└── providers/
    ├── payuProvider.ts   # PayU India implementation
    ├── paddleProvider.ts # Future: Paddle for international
    └── revenueCatProvider.ts # Future: RevenueCat for mobile stores
```

### Provider Selection Logic

```typescript
IF user.country === "IN" AND currency === "INR"
  → use PayUProvider
ELSE
  → use InternationalProvider (Paddle / RevenueCat - future)
```

## Backend Implementation

### 1. Payment Order Creation

**Endpoint**: `POST /v/payments/create-order`

**Request Body**:
```json
{
  "planId": "pro",
  "period": "yearly",
  "currency": "INR",
  "couponCode": "WELCOME20", // optional
  "country": "IN" // optional, defaults to "IN"
}
```

**Response**:
```json
{
  "message": "Payment order created successfully",
  "order": {
    "orderId": "ORD_1234567890_abc123",
    "amount": 15999,
    "currency": "INR",
    "totalAmount": 18878.82,
    "redirectUrl": "https://test.payu.in/_payment?key=...&txnid=...",
    "expiresAt": "2024-01-15T11:00:00.000Z"
  }
}
```

### 2. Success/Failure URL Handlers

PayU redirects users to these endpoints after payment:

**Success**: `GET/POST /v/payments/success`
- Receives PayU response parameters
- Verifies payment hash
- Updates payment order status
- Creates/updates subscription
- Redirects to frontend success screen

**Failure**: `GET/POST /v/payments/failure`
- Receives PayU error response
- Updates payment order status
- Redirects to frontend failure screen

### 3. Webhook Handler

**Endpoint**: `POST /v/payments/webhook`

PayU sends server-to-server notifications here. Configure this URL in PayU dashboard.

**Webhook Events**:
- `payment.success` - Payment completed successfully
- `payment.failed` - Payment failed
- `payment.pending` - Payment pending
- `subscription.charge.success` - Recurring charge successful
- `subscription.charge.failed` - Recurring charge failed

**Important**: Always return HTTP 200 to PayU, even if processing fails internally.

### 4. Hash Generation & Verification

PayU uses SHA-512 hashes for request/response verification:

**Request Hash**: `SHA512(key|txnid|amount|productinfo|firstname|email|salt)`

**Response Hash**: `SHA512(salt|status|||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)`

Implementation: `src/utils/hashGenerator.ts`

## Frontend Implementation

### 1. Payment Flow

1. User selects plan and billing period on PricingScreen
2. User taps "Get Full Access" button
3. Frontend calls `POST /v/payments/create-order`
4. Backend returns `redirectUrl`
5. Frontend opens PayU hosted checkout page (InAppBrowser or external browser)
6. User completes payment on PayU page
7. PayU redirects to backend success/failure URL
8. Backend processes payment and redirects to frontend deep link
9. Frontend shows PaymentSuccessScreen or PaymentFailureScreen

### 2. Deep Linking

Configure deep links in your app:

**Android** (`android/app/src/main/AndroidManifest.xml`):
```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="novasafe" android:host="payment" />
</intent-filter>
```

**iOS** (`ios/NovaSafe/Info.plist`):
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>novasafe</string>
    </array>
  </dict>
</array>
```

**Deep Link URLs**:
- Success: `novasafe://payment/success?orderId=ORD_123&subscriptionId=SUB_456`
- Failure: `novasafe://payment/failure?orderId=ORD_123&error=payment_failed`

### 3. Payment Screens

**PaymentSuccessScreen** (`screens/PaymentSuccessScreen.tsx`):
- Displays success message
- Shows order ID
- Fetches updated subscription status
- Provides "Continue to App" button

**PaymentFailureScreen** (`screens/PaymentFailureScreen.tsx`):
- Displays failure message
- Shows error details
- Provides "Try Again" and "Go Back" buttons

## Environment Configuration

### Backend Environment Variables

```bash
# PayU Credentials
PAYU_MERCHANT_ID=your_merchant_id
PAYU_MERCHANT_KEY=your_merchant_key
PAYU_MERCHANT_SALT=your_merchant_salt

# PayU Environment
PAYU_ENVIRONMENT=sandbox # or "production"

# PayU URLs (optional - defaults provided)
PAYU_BASE_URL=https://test.payu.in # or https://secure.payu.in for production
PAYU_API_URL=https://test.payu.in # or https://secure.payu.in for production

# Callback URLs (backend endpoints)
PAYU_SUCCESS_URL=https://your-backend.com/v/payments/success
PAYU_FAILURE_URL=https://your-backend.com/v/payments/failure
PAYU_WEBHOOK_URL=https://your-backend.com/v/payments/webhook

# Frontend Deep Link URLs (for redirects)
FRONTEND_PAYMENT_SUCCESS_URL=novasafe://payment/success
FRONTEND_PAYMENT_FAILURE_URL=novasafe://payment/failure

# Backend Base URL
BACKEND_URL=https://your-backend.com
```

### PayU Dashboard Configuration

1. **Login** to PayU Merchant Dashboard
2. **Navigate** to Settings → Integration → Payment Gateway
3. **Configure**:
   - Success URL: `https://your-backend.com/v/payments/success`
   - Failure URL: `https://your-backend.com/v/payments/failure`
   - Webhook URL: `https://your-backend.com/v/payments/webhook`
4. **Enable** webhook notifications for:
   - Payment Success
   - Payment Failure
   - Subscription Charge Success
   - Subscription Charge Failure

## Recurring Payments

### Setup Flow

1. User initiates subscription payment
2. Backend creates payment order with `paymentType: 'recurring'`
3. PayU hosted checkout collects payment consent (SI - Standing Instruction)
4. On successful payment, PayU returns `customerToken`
5. Backend stores `customerToken` in subscription record
6. Backend can charge recurring payments using SI API

### Recurring Charge API

**Endpoint**: PayU SI Transaction API

**Request**:
```typescript
{
  key: merchantKey,
  command: 'si_transaction',
  var1: customerToken,
  var2: amount,
  var3: currency,
  hash: generatedHash
}
```

**Implementation**: `src/services/recurringPaymentService.ts`

### Automatic Recurring Charges

Set up a cron job to process due subscriptions:

```typescript
import { processDueRecurringSubscriptions } from './services/recurringPaymentService';

// Run daily at midnight
cron.schedule('0 0 * * *', async () => {
  const result = await processDueRecurringSubscriptions();
  console.log(`Processed ${result.processed} subscriptions: ${result.succeeded} succeeded, ${result.failed} failed`);
});
```

## Testing

### Sandbox Credentials

PayU provides test credentials for sandbox environment:

- **Test Cards**: Use PayU test card numbers from dashboard
- **Test UPI**: Use test UPI IDs
- **Test NetBanking**: Use test bank credentials

### Test Scenarios

1. **Successful Payment**:
   - Create order → Complete payment → Verify subscription active

2. **Failed Payment**:
   - Create order → Cancel payment → Verify order status = failed

3. **Webhook Processing**:
   - Trigger webhook manually → Verify order updated

4. **Recurring Charge**:
   - Setup subscription → Wait for period end → Verify charge processed

## Security Best Practices

1. **Never expose merchant salt** in frontend code
2. **Always verify hash** on backend before processing payment
3. **Use HTTPS** for all callback URLs and webhooks
4. **Validate webhook signatures** (if PayU provides)
5. **Store sensitive data** (customer tokens) encrypted
6. **Log all payment events** for audit trail
7. **Implement rate limiting** on webhook endpoints

## Error Handling

### Common Errors

1. **Hash Verification Failed**:
   - Check merchant key/salt configuration
   - Verify hash generation algorithm matches PayU spec

2. **Order Not Found**:
   - Check orderId/txnid mapping
   - Verify database connection

3. **Payment Timeout**:
   - Check PayU API availability
   - Verify network connectivity

4. **Webhook Not Received**:
   - Verify webhook URL is accessible
   - Check PayU dashboard configuration
   - Review firewall/security group settings

## Monitoring & Logging

All payment events are logged with:
- Order ID
- Transaction ID
- Payment status
- Error messages (if any)
- Timestamps

**Log Levels**:
- `info`: Payment order created, payment completed
- `warn`: Hash verification failed, order not found
- `error`: Payment processing errors, API failures

## Support & Troubleshooting

### PayU Documentation

- [PayU India Docs](https://docs.payu.in/docs/)
- [Hosted Checkout](https://docs.payu.in/reference/_payment_payu_hosted_checkout)
- [Recurring Payments](https://docs.payu.in/reference/recurring_payment_api)
- [Webhooks](https://docs.payu.in/docs/webhooks)

### Common Issues

1. **"Page Not Found" when opening payment URL**:
   - Verify PayU base URL is correct
   - Check if all required parameters are included
   - Ensure merchant key is valid

2. **Payment succeeds but subscription not created**:
   - Check webhook/callback processing logs
   - Verify database connection
   - Check subscription service logs

3. **Recurring charges not working**:
   - Verify customer token is stored
   - Check SI API credentials
   - Review recurring payment service logs

## Future Enhancements

1. **International Payment Providers**:
   - Paddle integration for USD/EUR/GBP
   - RevenueCat for App Store/Play Store subscriptions

2. **Payment Methods**:
   - UPI deep linking
   - Wallet integration
   - EMI options

3. **Analytics**:
   - Payment conversion tracking
   - Revenue analytics
   - Churn analysis

## Deployment Checklist

- [ ] Configure PayU merchant credentials
- [ ] Set environment variables
- [ ] Configure PayU dashboard (success/failure/webhook URLs)
- [ ] Test payment flow in sandbox
- [ ] Configure deep linking in app
- [ ] Set up webhook endpoint monitoring
- [ ] Configure recurring payment cron job
- [ ] Test webhook processing
- [ ] Verify hash generation/verification
- [ ] Review error handling and logging
- [ ] Switch to production credentials
- [ ] Monitor first production payments


