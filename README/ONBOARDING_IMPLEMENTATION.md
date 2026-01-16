# Onboarding Flow Implementation

## Overview
Complete implementation of the onboarding flow with support for both email/password and Google signup, including all validation, logging, and security features.

## Files Created/Modified

### 1. Models
- **`src/models/User.ts`** - Updated to support:
  - Password-based authentication (`passwordHash`, `signupMethod`)
  - Email verification status (`emailVerified`, `emailVerifiedAt`)
  - Onboarding status (`onboardingCompleted`)
  - Plan information (`planId`, `companyName`, `phoneNumber`, `companyDomain`)
  - Made `googleId` optional (only for Google signup users)

- **`src/models/OTP.ts`** - New model for email verification OTPs:
  - Email, hashed OTP, expiration, verification status
  - Purpose tracking (email_verification, password_reset)
  - Attempt tracking for security

### 2. Services
- **`src/services/onboardingService.ts`** - New service with:
  - `checkEmailExists()` - Check if email is already registered
  - `generateOTP()` - Generate 6-digit OTP
  - `createOTP()` - Create and store OTP with expiration
  - `verifyOTPCode()` - Verify OTP with attempt tracking
  - `createAccount()` - Create new user account with password hashing
  - `generateRecoverySecrets()` - Generate recovery key and master password
  - `saveRecoveryKey()` - Hash and store recovery key
  - `completeOnboarding()` - Mark onboarding as complete

### 3. Controllers
- **`src/controllers/OnboardingController.ts`** - New controller with endpoints:
  - `checkEmail` - POST `/v/onboarding/check-email`
  - `sendOTP` - POST `/v/onboarding/send-otp`
  - `verifyOTP` - POST `/v/onboarding/verify-otp`
  - `createAccountEndpoint` - POST `/v/onboarding/create-account`
  - `generateRecoveryKey` - POST `/v/onboarding/generate-recovery-key`
  - `completeOnboardingEndpoint` - POST `/v/onboarding/complete`

- **`src/controllers/Auth.ts`** - Updated:
  - `emailLogin` - New endpoint for password-based login
  - `googleSignIn` - Updated to handle onboarding flow:
    - Only logs in existing users
    - Links Google account to existing email users
    - Returns error for new users (must go through onboarding)

### 4. Routes
- **`src/routes/onboardingRoute.ts`** - New route file with all onboarding endpoints
- **`src/routes/authRoute.ts`** - Updated to include email login endpoint
- **`src/server.ts`** - Updated to register onboarding routes

### 5. Configuration
- **`config/config.ts`** - Added `otps` collection to DBCONFIG

## API Endpoints

### Onboarding Endpoints

#### 1. Check Email
```
POST /v/onboarding/check-email
Body: { "email": "user@example.com" }
Response: { "exists": false, "message": "Email is available" }
```

#### 2. Send OTP
```
POST /v/onboarding/send-otp
Body: { "email": "user@example.com" }
Response: { "message": "OTP sent successfully", "expiresIn": 600 }
```

#### 3. Verify OTP
```
POST /v/onboarding/verify-otp
Body: { "email": "user@example.com", "otp": "123456" }
Response: { "message": "OTP verified successfully", "verified": true }
```

#### 4. Create Account
```
POST /v/onboarding/create-account
Body: {
  "email": "user@example.com",
  "fullName": "John Doe",
  "password": "SecurePassword123!",
  "signupMethod": "email" | "google",
  "planId": "individual" | "family" | "team" | "business",
  "companyName": "Acme Corp" (optional),
  "phoneNumber": "+1234567890" (optional),
  "companyDomain": "acme.com" (optional),
  "googleCredential": "..." (optional, for Google signup)
}
Response: {
  "message": "Account created successfully",
  "success": true,
  "userId": "507f1f77bcf86cd799439011",
  "user": { ... }
}
```

#### 5. Generate Recovery Key
```
POST /v/onboarding/generate-recovery-key
Body: { "userId": "507f1f77bcf86cd799439011" }
Response: {
  "message": "Recovery key generated successfully",
  "recoveryKey": "...",
  "masterPassword": "...",
  "encryptedData": "..."
}
```

#### 6. Complete Onboarding
```
POST /v/onboarding/complete
Body: { "userId": "507f1f77bcf86cd799439011" }
Response: {
  "message": "Onboarding completed successfully",
  "token": "jwt_token",
  "user": { ... }
}
```

### Authentication Endpoints

#### Email/Password Login
```
POST /v/auth/email
Body: { "email": "user@example.com", "password": "password" }
Response: {
  "message": "Authentication successful",
  "token": "jwt_token",
  "user": { ... },
  "requires2FA": false
}
```

#### Google Login (Updated)
```
POST /v/auth/google
Body: { "credential": "google_id_token" }
Response: {
  "message": "Authentication successful",
  "token": "jwt_token",
  "user": { ... },
  "requires2FA": false
}
Note: Returns 404 for new users (must go through onboarding)
```

## Security Features

1. **Password Hashing**: bcrypt with salt rounds 10
2. **OTP Security**:
   - 6-digit OTP, hashed before storage
   - 10-minute expiration
   - Max 5 verification attempts
   - Auto-invalidation of old OTPs
3. **Account Locking**: 5 failed login attempts = 30-minute lock
4. **Recovery Key**: Hashed with bcrypt, never stored in plaintext
5. **Email Verification**: Required for email signup (OTP), automatic for Google signup
6. **Session Management**: JWT tokens with session tracking

## Validation

All endpoints include:
- Email format validation
- Required field validation
- Plan ID validation
- Password strength (handled by frontend, but backend validates presence)
- OTP format validation (6 digits)

## Logging

Comprehensive logging using pino logger:
- All operations logged (info level)
- Errors logged with context (error level)
- Security events logged (warn level)
- Email checks, OTP operations, account creation, login attempts

## Database Collections

- `vaultUsers` - User accounts (updated schema)
- `otps` - Email verification OTPs (new collection)

## Flow Summary

### Email Signup Flow:
1. Check email exists → `/v/onboarding/check-email`
2. Send OTP → `/v/onboarding/send-otp`
3. Verify OTP → `/v/onboarding/verify-otp`
4. Create account → `/v/onboarding/create-account`
5. Generate recovery key → `/v/onboarding/generate-recovery-key`
6. Complete onboarding → `/v/onboarding/complete` (returns JWT token)

### Google Signup Flow:
1. User signs in with Google (frontend)
2. Create account → `/v/onboarding/create-account` (with `googleCredential`)
3. Generate recovery key → `/v/onboarding/generate-recovery-key`
4. Complete onboarding → `/v/onboarding/complete` (returns JWT token)

### Login Flow:
- **Email Login**: `/v/auth/email` (email + password)
- **Google Login**: `/v/auth/google` (Google credential, existing users only)

## Notes

1. **OTP Email Service**: Currently logs OTP in development. In production, integrate with email service (SendGrid, AWS SES, etc.)

2. **Recovery Key**: Currently returned in response. In production, consider:
   - Sending via secure email
   - Encrypting before storage
   - Using secure download link

3. **Google Login**: Updated to only work for existing users. New users must complete onboarding first.

4. **Password Requirements**: Enforced by frontend. Backend validates presence only.

5. **Account Linking**: If user signs up with email, then tries Google login, Google account is linked to existing email account.

## Testing

Test all endpoints with:
- Valid inputs
- Invalid inputs (validation errors)
- Duplicate emails
- Expired OTPs
- Invalid OTPs
- Account lock scenarios
- Google credential verification

## Next Steps

1. Integrate email service for OTP delivery
2. Add rate limiting for OTP requests
3. Add email verification status tracking
4. Implement recovery key secure delivery
5. Add password reset flow
6. Add account activation email
7. Add audit logging for onboarding events

