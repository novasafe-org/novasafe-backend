# Razorpay Payment Methods Guide

## Overview

Razorpay automatically shows different payment methods based on the **currency** you use:

- **INR (Indian Rupees)**: Shows all Indian payment methods (UPI, Netbanking, Wallets, Cards)
- **USD/EUR/GBP (International)**: Shows only International Cards

## Payment Methods by Currency

### 🇮🇳 Indian Payments (INR)

When using **INR currency**, Razorpay automatically shows:

✅ **UPI** (Unified Payments Interface)
- Google Pay, PhonePe, Paytm, BHIM UPI, etc.
- Instant payments, no card required

✅ **Netbanking**
- All major Indian banks
- Direct bank transfers

✅ **Wallets**
- Paytm, Freecharge, Mobikwik, etc.

✅ **Cards**
- Debit cards (Indian banks)
- Credit cards (Indian banks)

**Note**: These methods are only shown if they are **enabled in your Razorpay Dashboard**.

### 🌍 International Payments (USD/EUR/GBP)

When using **USD, EUR, or GBP currency**, Razorpay shows:

✅ **International Cards Only**
- Visa, Mastercard, Amex
- Cards issued by foreign banks
- International payment processing

❌ **UPI, Netbanking, Wallets are NOT available** for international currencies

## Why Only Cards Show for USD/EUR?

This is **expected behavior** from Razorpay:

1. **UPI** is India-specific and only works with INR
2. **Netbanking** is for Indian banks only
3. **Wallets** are India-specific services
4. **International cards** are the standard method for USD/EUR payments

## How to Enable UPI/Netbanking for INR Payments

### Step 1: Enable in Razorpay Dashboard

1. Log into [Razorpay Dashboard](https://dashboard.razorpay.com)
2. Go to **Settings** → **Payment Methods**
3. Enable the payment methods you want:
   - ✅ **UPI**
   - ✅ **Netbanking**
   - ✅ **Wallets**
   - ✅ **Cards** (usually enabled by default)

### Step 2: Verify Account Status

- Ensure your Razorpay account is **KYC verified**
- Complete all required documentation
- Some payment methods require additional verification

### Step 3: Test with INR Currency

1. In your app, select **INR** as the currency
2. Create a payment order with `currency: 'INR'`
3. Open Razorpay checkout
4. You should now see UPI, Netbanking, Wallets, and Cards

## Currency Selection Logic

### For Indian Users

```typescript
// Frontend should detect user country and use INR
const currency = userCountry === 'IN' ? 'INR' : 'USD';
```

### For International Users

```typescript
// Use USD/EUR/GBP based on user preference
const currency = 'USD'; // or 'EUR', 'GBP'
```

## Current Implementation

### Backend Currency Support

The backend supports:
- ✅ **INR** - For Indian payments (shows all methods)
- ✅ **USD** - For international payments (cards only)
- ✅ **EUR** - For international payments (cards only)
- ✅ **GBP** - For international payments (cards only)

### Frontend Currency Selection

The frontend determines currency based on:
1. User's selected currency preference
2. User's country (if available)
3. Default to USD for international users

## Testing Payment Methods

### Test Indian Payments (INR)

1. Set currency to `INR` in your app
2. Create a payment order
3. Open Razorpay checkout
4. You should see:
   - UPI option (Google Pay, PhonePe, etc.)
   - Netbanking option
   - Wallets option
   - Cards option

### Test International Payments (USD)

1. Set currency to `USD` in your app
2. Create a payment order
3. Open Razorpay checkout
4. You should see:
   - ✅ Cards option (Visa, Mastercard, Amex)
   - ❌ No UPI, Netbanking, or Wallets

## Troubleshooting

### Issue: Only Cards Showing for INR

**Possible Causes:**
1. Payment methods not enabled in Razorpay Dashboard
2. Account not fully KYC verified
3. Testing with test keys (some methods disabled in test mode)

**Solutions:**
1. Check Razorpay Dashboard → Settings → Payment Methods
2. Enable UPI, Netbanking, Wallets
3. Complete KYC verification
4. Use live keys for production (test mode has limitations)

### Issue: Payment Methods Not Appearing

**Check:**
1. Currency is correctly set to INR
2. Razorpay account is active and verified
3. Payment methods are enabled in dashboard
4. Using correct Razorpay key (test vs live)

## Razorpay Dashboard Configuration

### Required Settings

1. **Payment Methods** → Enable:
   - UPI
   - Netbanking
   - Wallets
   - Cards

2. **Account Settings** → Complete:
   - KYC verification
   - Bank account details
   - Business details

3. **Webhooks** → Configure:
   - Payment webhook URL
   - Subscription webhook URL

## Summary

| Currency | Payment Methods Available |
|----------|---------------------------|
| **INR** | UPI, Netbanking, Wallets, Cards (if enabled) |
| **USD** | International Cards only |
| **EUR** | International Cards only |
| **GBP** | International Cards only |

**Key Points:**
- ✅ Payment methods are **automatic** based on currency
- ✅ INR shows all Indian methods (if enabled in dashboard)
- ✅ USD/EUR/GBP show only cards (expected behavior)
- ✅ Enable UPI/Netbanking in Razorpay Dashboard for INR
- ✅ No code changes needed - it's a Razorpay configuration

## Additional Resources

- [Razorpay Payment Methods Documentation](https://razorpay.com/docs/payments/payment-methods/)
- [Razorpay International Payments](https://razorpay.com/docs/payments/international-payments/)
- [Razorpay Dashboard](https://dashboard.razorpay.com)

