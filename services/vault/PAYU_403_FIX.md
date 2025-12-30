# PayU 403 Error - Troubleshooting Guide

## Error Summary

**Error**: `Request failed with status code 403`  
**Endpoint**: `POST https://secure.payu.in/api/v2/payment`  
**Status**: Forbidden

## Common Causes

### 1. **Environment Mismatch** ⚠️ **MOST LIKELY**

**Problem**: Using production PayU URL with sandbox/test credentials (or vice versa)

**Solution**:
- Check your `.env` file for `PAYU_ENVIRONMENT`
- If using **sandbox/test credentials**, set:
  ```env
  PAYU_ENVIRONMENT=sandbox
  PAYU_TEST_URL=https://test.payu.in
  PAYU_TEST_API_URL=https://test.payu.in/api/v2
  ```
- If using **production credentials**, set:
  ```env
  PAYU_ENVIRONMENT=production
  PAYU_BASE_URL=https://secure.payu.in
  PAYU_API_URL=https://secure.payu.in/api/v2
  ```

### 2. **Invalid Merchant Credentials**

**Problem**: Wrong merchant key, salt, or merchant ID

**Solution**:
- Verify credentials in PayU dashboard
- For **sandbox**: Use test credentials from PayU test dashboard
- For **production**: Use production credentials from PayU merchant dashboard
- Ensure no extra spaces or quotes in `.env` file

### 3. **Hash Generation Error**

**Problem**: Hash doesn't match PayU's expected format

**Current Hash Generation**:
```typescript
// Parameters sorted alphabetically
key|value|key|value|...|salt
// Then SHA512 hash
```

**PayU Requirements**:
- Parameters must be in specific order: `key|txnid|amount|productinfo|firstname|email|...|salt`
- All values must be strings
- Amount must be in format "X.XX" (2 decimal places)

### 4. **Merchant Account Not Activated**

**Problem**: Merchant account not fully activated in PayU

**Solution**:
- Check PayU dashboard for account status
- Ensure all required documents are submitted
- Contact PayU support if account is pending activation

### 5. **API Endpoint Issue**

**Problem**: Wrong API endpoint or version

**Current**: `/api/v2/payment`  
**Alternative**: Some PayU accounts use `/payment` directly

## Fixes Applied

### ✅ **Fix 1**: Environment-Based URL Switching

Updated `config/config.ts` to automatically switch URLs based on `PAYU_ENVIRONMENT`:

```typescript
get apiUrl(): string {
  if (this.environment === 'sandbox') {
    return 'https://test.payu.in/api/v2';
  }
  return 'https://secure.payu.in/api/v2';
}
```

### ✅ **Fix 2**: Enhanced Error Logging

Added detailed error logging to help diagnose issues:
- Logs API URL being used
- Logs environment (sandbox/production)
- Logs full request payload
- Logs full error response from PayU

### ✅ **Fix 3**: Removed Unnecessary Parameters

Removed `pg` and `bankcode` parameters that were causing issues for non-recurring payments.

## Testing Steps

### Step 1: Verify Environment Variables

```bash
# Check your .env file
cat .env | grep PAYU
```

**Expected for Sandbox**:
```env
PAYU_ENVIRONMENT=sandbox
PAYU_MERCHANT_KEY=your_test_key
PAYU_MERCHANT_SALT=your_test_salt
PAYU_MERCHANT_ID=your_test_merchant_id
```

**Expected for Production**:
```env
PAYU_ENVIRONMENT=production
PAYU_MERCHANT_KEY=your_production_key
PAYU_MERCHANT_SALT=your_production_salt
PAYU_MERCHANT_ID=your_production_merchant_id
```

### Step 2: Test API Connection

```bash
# Start backend server
npm run dev

# Check logs when payment is attempted
# Look for:
# - PayU API URL being used
# - PayU Environment
# - Request payload
# - Error response details
```

### Step 3: Verify PayU Dashboard

1. Login to PayU dashboard
2. Check account status (should be "Active")
3. Verify API credentials match `.env` file
4. Check if account is in sandbox or production mode

## Quick Fix Checklist

- [ ] Set `PAYU_ENVIRONMENT=sandbox` if using test credentials
- [ ] Set `PAYU_ENVIRONMENT=production` if using production credentials
- [ ] Verify merchant key matches PayU dashboard
- [ ] Verify merchant salt matches PayU dashboard
- [ ] Verify merchant ID matches PayU dashboard
- [ ] Check PayU account is activated
- [ ] Restart backend server after changing `.env`
- [ ] Check backend logs for detailed error messages

## PayU Test Credentials

If you need test credentials, check PayU documentation:
- **Sandbox Dashboard**: https://test.payu.in/
- **Test Merchant Key**: Usually provided in sandbox dashboard
- **Test Merchant Salt**: Usually provided in sandbox dashboard

## Next Steps

1. **Update `.env` file** with correct environment setting
2. **Restart backend server**
3. **Try payment again** and check logs
4. **Review error logs** for specific PayU error message
5. **Contact PayU support** if issue persists with correct credentials

## Error Response Format

PayU typically returns errors in this format:
```json
{
  "status": 0,
  "msg": "Error message here"
}
```

Check the `msg` field in error logs for specific PayU error message.



