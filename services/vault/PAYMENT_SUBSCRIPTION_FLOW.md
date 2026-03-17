# Payment & Subscription Flow (NovaSafe)

This document describes the subscription and payment flow and the backend enforcement added for production readiness.

---

## 1. User signup → workspace + trial

- **Onboarding** (`onboardingService.completeOnboarding`): After account creation, creates default workspace (via `getDefaultWorkspaceIdForUser`) and a **subscription** with:
  - `status: 'trialing'`
  - `trialStart`, `trialEnd` / `trialEndsAt` from config (`TRIAL_DAYS` / `TRIAL_MINUTES`)
  - `workspaceId` set (subscription is per workspace)
- **Config**: Trial length is driven by `config/trial.config.ts` (env `TRIAL_DAYS`, `TRIAL_MINUTES`).

---

## 2. During trial – access control

- **Middleware** `requireActiveSubscription` (after `loadRBACContext`):
  - Resolves workspace from `req.rbacContext.organizationId`.
  - Uses `hasActiveSubscriptionAccess(workspaceId)`:
    - Subscription must exist with `status: 'active'` **or** `status: 'trialing'` with `trialEnd`/`trialEndsAt` ≥ now.
  - If access is denied:
    - **402** with `code: 'TRIAL_EXPIRED'` or `'SUBSCRIPTION_REQUIRED'` and a clear `userMessage` for the frontend.
- **Applied on**: Vault routes (`/v/*` vault items, attachments), folder routes (`/v/folders/*`). Not applied on auth, account, billing, payment, subscription read, so users can always open billing/upgrade.

---

## 3. Trial expiry

- **Real-time**: `requireActiveSubscription` treats `trialing` with `trialEnd` &lt; now as no access (402).
- **Background**: `checkExpiredSubscriptions()` marks subscriptions as `status: 'expired'` when:
  - `currentPeriodEnd` or `expiresAt` or `trialEnd` or `trialEndsAt` is in the past.
- **Scheduling**: Runs every hour via `setInterval` in `server.ts`. Access is enforced on each request even if the job has not run yet.

---

## 4. Payment flow (Razorpay)

- **Create order**: `POST /v/payments/create-order` → `paymentService.createPaymentOrder` → provider (Razorpay) order.
- **Frontend**: Uses `orderId` / `razorpayOrderId` and opens Razorpay Checkout.
- **Success**:
  - **Callback** (redirect or webhook): `processPaymentCallback`:
    - Verifies signature.
    - Marks order `completed`.
    - **Subscription**:
      - If **existing subscription** for user (active/trialing): `renewSubscription`.
      - Else if **existing subscription for workspace (any status)** (e.g. expired trial): **update** that subscription to `active` with new period and `lastPaymentOrderId` (no duplicate subscription per workspace).
      - Else: **create** new subscription with `workspaceId`, `trialDays: 0`.
    - **Idempotency**: If order is already `completed` and has `subscriptionId`, returns success without re-running subscription logic.
- **Webhooks** (Razorpay): `subscription.activated`, `subscription.charged`, `subscription.canceled`, `subscription.completed`, `payment.authorized`, `payment.failed`, `payment.success` / `payment.captured` are handled in `PaymentController.handleRazorpayWebhook`; subscription status and payment method details are updated accordingly.

---

## 5. Post-payment access

- Subscription is `status: 'active'` and tied to `workspaceId`.
- `requireActiveSubscription` allows access; 402 is no longer returned for that workspace.

---

## 6. Access control summary

| Check                    | Where                    | Effect                                                                 |
|--------------------------|--------------------------|------------------------------------------------------------------------|
| Auth                     | `authMiddleware`         | 401 if not logged in                                                  |
| RBAC (workspace/role)    | `loadRBACContext` + perms| 403 if wrong workspace or missing permission                          |
| Subscription / trial     | `requireActiveSubscription` | 402 if no active subscription and not in valid trial              |

Protected feature routes use: `authMiddleware` → `loadRBACContext` → `requireActiveSubscription` → `requirePermission(...)` → handler.

---

## 7. Testing

- **Short trial**: Set `TRIAL_MINUTES=2` (or `TRIAL_DAYS=1`) in vault `.env` to test trial expiry and upgrade flow.
- **Manual expiry**: In DB, set `trialEnd` to a past date or run `checkExpiredSubscriptions()`; next vault/folder request should get 402.
- **Razorpay test mode**: Use test keys and test cards; webhooks can be forwarded with ngrok or Razorpay dashboard.
- **Duplicate webhook / refresh**: Callback is idempotent when order is already `completed`.

---

## 8. Edge cases addressed

- **Trial expired but payment not completed**: 402 on vault/folder until user pays; after payment, subscription is updated or created and access is allowed.
- **Payment success but backend not updated**: Webhook handler updates subscription; if webhook fails, user can use “Verify payment” or support can fix from dashboard; idempotent callback avoids double subscription on retry.
- **Duplicate payment attempts**: Same order can be verified once; idempotency returns success with existing `subscriptionId`.
- **One subscription per workspace**: Payment callback updates existing workspace subscription (any status) instead of creating a second one when upgrading after trial.
