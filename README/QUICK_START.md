# PayU Payment Integration - Quick Start Guide

## 🚀 Getting Started

### 1. Backend Setup

#### Install Dependencies
```bash
cd services/vault
npm install
```

#### Configure Environment Variables
Create/update `.env` file:
```bash
# PayU Credentials (Get from PayU Dashboard)
PAYU_MERCHANT_ID=your_merchant_id
PAYU_MERCHANT_KEY=your_merchant_key
PAYU_MERCHANT_SALT=your_merchant_salt

# Environment
PAYU_ENVIRONMENT=sandbox  # Use "production" for live payments

# Backend URL (for callbacks)
BACKEND_URL=http://localhost:3000  # Update for production

# Frontend Deep Links
FRONTEND_PAYMENT_SUCCESS_URL=novasafe://payment/success
FRONTEND_PAYMENT_FAILURE_URL=novasafe://payment/failure
```

#### Start Backend Server
```bash
npm run dev
```

### 2. PayU Dashboard Configuration

1. Login to [PayU Merchant Dashboard](https://dashboard.payu.in)
2. Go to **Settings → Integration → Payment Gateway**
3. Set:
   - **Success URL**: `http://your-backend.com/v/payments/success`
   - **Failure URL**: `http://your-backend.com/v/payments/failure`
   - **Webhook URL**: `http://your-backend.com/v/payments/webhook`
4. Enable webhook notifications

### 3. Frontend Setup

#### Install Dependencies (if needed)
```bash
cd ../../NovaSafe
npm install react-native-inappbrowser-reborn  # Optional but recommended
```

#### Configure Deep Linking

**Android** (`android/app/src/main/AndroidManifest.xml`):
```xml
<activity
  android:name=".MainActivity"
  ...>
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="novasafe" android:host="payment" />
  </intent-filter>
</activity>
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

### 4. Test Payment Flow

#### Create Test Order
```bash
curl -X POST http://localhost:3000/v/payments/create-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "planId": "pro",
    "period": "yearly",
    "currency": "INR"
  }'
```

#### Response:
```json
{
  "message": "Payment order created successfully",
  "order": {
    "orderId": "ORD_1234567890_abc123",
    "redirectUrl": "https://test.payu.in/_payment?key=...",
    ...
  }
}
```

#### Open Payment URL
Copy `redirectUrl` and open in browser. Use PayU test credentials to complete payment.

### 5. Verify Payment

#### Check Payment Status
```bash
curl http://localhost:3000/v/payments/status?orderId=ORD_1234567890_abc123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Check Subscription
```bash
curl http://localhost:3000/v/subscriptions/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🧪 Testing Checklist

- [ ] Payment order creation works
- [ ] PayU hosted checkout opens correctly
- [ ] Success redirect works (deep link or polling)
- [ ] Failure redirect works
- [ ] Webhook receives notifications
- [ ] Subscription created after successful payment
- [ ] Hash verification works
- [ ] Error handling works

## 🔍 Troubleshooting

### Payment URL Returns 404
- Check PayU base URL configuration
- Verify all required parameters are included
- Check merchant key is correct

### Hash Verification Fails
- Verify merchant salt is correct
- Check hash generation algorithm matches PayU spec
- Ensure all parameters are included in hash

### Webhook Not Received
- Verify webhook URL is publicly accessible
- Check PayU dashboard configuration
- Review firewall/security group settings
- Check backend logs for errors

### Deep Link Not Working
- Verify deep link configuration in AndroidManifest.xml / Info.plist
- Test deep link manually: `adb shell am start -W -a android.intent.action.VIEW -d "novasafe://payment/success?orderId=TEST"`
- Check app is handling deep links correctly

## 📚 Documentation

- **Full Integration Guide**: `PAYU_INTEGRATION_GUIDE.md`
- **Implementation Summary**: `PAYMENT_IMPLEMENTATION_SUMMARY.md`
- **PayU Official Docs**: https://docs.payu.in/docs/

## 🆘 Support

For issues:
1. Check logs: `services/vault/logs/`
2. Review PayU dashboard for transaction status
3. Verify environment variables are set correctly
4. Check PayU documentation for API changes


