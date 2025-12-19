# Payment System Implementation

## Overview
Complete payment system implementation for NovaSafe using PayU payment gateway. Supports both recurring (monthly/yearly) and one-time payments with proper error handling and SOLID principles.

## Architecture

### Models
- **Subscription** (`src/models/Subscription.ts`): User subscription data
- **PaymentOrder** (`src/models/PaymentOrder.ts`): Payment transaction records
- **Coupon** (`src/models/Coupon.ts`): Discount coupon management

### Services
- **PayU Service** (`src/services/payuService.ts`): PayU gateway integration
- **Payment Service** (`src/services/paymentService.ts`): Payment order management
- **Subscription Service** (`src/services/subscriptionService.ts`): Subscription lifecycle management
- **Coupon Service** (`src/services/couponService.ts`): Coupon validation and discount calculation

### Controllers
- **Payment Controller** (`src/controllers/PaymentController.ts`): Payment HTTP handlers
- **Subscription Controller** (`src/controllers/SubscriptionController.ts`): Subscription HTTP handlers
- **Pricing Controller** (`src/controllers/PricingController.ts`): Pricing plans HTTP handlers

### Routes
- `/v/payments/*` - Payment endpoints
- `/v/subscriptions/*` - Subscription endpoints
- `/v/pricing/*` - Pricing endpoints

## Database Collections

### subscriptions
- `userId`: Reference to user
- `planId`: Plan identifier
- `status`: Subscription status (active, trialing, canceled, expired, etc.)
- `billingPeriod`: monthly, yearly, or one_time
- `currentPeriodStart/End`: Billing period dates
- `payuSubscriptionId`: PayU recurring subscription ID
- `payuCustomerToken`: PayU customer token for recurring payments

### payment_orders
- `orderId`: Unique order identifier
- `userId`: Reference to user
- `planId`: Plan being purchased
- `status`: Payment status (pending, processing, completed, failed, etc.)
- `amount`, `totalAmount`, `taxAmount`, `discountAmount`: Pricing breakdown
- `payuTransactionId`: PayU transaction ID
- `payuRedirectUrl`: PayU checkout URL
- `subscriptionId`: Reference to created subscription

### coupons
- `code`: Unique coupon code
- `discountType`: percentage or fixed
- `discountValue`: Discount amount
- `validFrom/validUntil`: Validity period
- `maxUsage`: Maximum usage limit
- `usageCount`: Current usage count
- `applicablePlanIds`: Plans this coupon applies to
- `applicablePeriods`: Billing periods this coupon applies to

## Environment Variables

Add to `.env`:
```env
# PayU Configuration
PAYU_MERCHANT_ID=your_merchant_id
PAYU_MERCHANT_KEY=your_merchant_key
PAYU_MERCHANT_SALT=your_merchant_salt
PAYU_BASE_URL=https://secure.payu.in
PAYU_API_URL=https://secure.payu.in/api/v2
PAYU_ENVIRONMENT=production
PAYU_ENABLE_RECURRING=true
PAYU_SUCCESS_URL=https://novasafe.app/payment/success
PAYU_FAILURE_URL=https://novasafe.app/payment/failure
PAYU_PAYMENT_TIMEOUT=1800
PAYU_ORDER_EXPIRY_MINUTES=30
```

## API Endpoints

### Payment Endpoints

#### POST /v/payments/create-order
Create a new payment order.

**Request:**
```json
{
  "planId": "pro",
  "period": "yearly",
  "currency": "INR",
  "couponCode": "WELCOME20"
}
```

**Response:**
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

#### GET /v/payments/status?orderId=ORD_123
Get payment order status.

#### POST /v/payments/callback
PayU webhook callback (public endpoint).

#### POST /v/pricing/validate-coupon
Validate coupon code.

### Subscription Endpoints

#### GET /v/subscriptions/me
Get current user's subscription.

**Response:**
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

#### POST /v/subscriptions/cancel
Cancel subscription.

#### POST /v/subscriptions/restore
Restore purchases (for mobile apps).

### Pricing Endpoints

#### GET /v/pricing/plans?currency=INR
Get all pricing plans.

#### GET /v/pricing/config?currency=INR
Get pricing configuration.

## Payment Flow

1. **User selects plan** → Frontend calls `/v/payments/create-order`
2. **Backend creates order** → Generates orderId, calculates pricing, creates PayU order
3. **User redirected to PayU** → Frontend opens PayU checkout URL
4. **User completes payment** → PayU processes payment
5. **PayU callback** → PayU sends callback to `/v/payments/callback`
6. **Backend verifies payment** → Verifies hash, updates order status
7. **Subscription created** → Creates/updates subscription record
8. **Frontend polls status** → Checks `/v/payments/status` until completed

## Recurring Payments

For recurring subscriptions:
1. Initial payment creates subscription with `payuSubscriptionId`
2. PayU automatically charges user at billing period end
3. Backend receives webhook for renewal payment
4. Subscription period extended automatically

## Error Handling

- All services use try-catch with proper error logging
- Controllers return appropriate HTTP status codes
- Frontend receives user-friendly error messages
- Payment failures are logged for debugging

## Security

- PayU hash verification for all callbacks
- User authentication required for all payment operations
- Order ownership verification
- Coupon usage limits enforced
- TTL indexes for automatic cleanup of expired data

## Database Indexes

Created via migration `003-payment-schema-setup.ts`:
- User ID indexes for fast lookups
- Status indexes for filtering
- TTL indexes for automatic cleanup
- Unique indexes for order IDs and coupon codes

## Frontend Integration

The frontend already has:
- `pricingService.ts` - API client
- `subscriptionStore.ts` - State management
- `PricingScreen.tsx` - UI components
- `PlanCard.tsx` - Shows "Current Plan" badge

## Testing

1. Test payment order creation
2. Test PayU callback handling
3. Test subscription creation/renewal
4. Test coupon validation
5. Test error scenarios

## Migration

Run migration:
```bash
# In vault service directory
npm run migrate:up 003-payment-schema-setup
```

## Next Steps

1. Set up PayU merchant account
2. Configure environment variables
3. Test payment flow in sandbox
4. Set up production PayU account
5. Configure webhook URLs in PayU dashboard
6. Monitor payment logs

