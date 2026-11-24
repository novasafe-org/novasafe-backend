/**
 * Auth configuration (ported from mobile_vault; env-driven).
 */
import { getEmailFrom } from './email-from.config';

export const authConfig = {
  jwt: {
    secret: process.env.JWT_SECRET || '',
    issuer: 'vault-backend',
    audience: 'vault-frontend',
    /** Short-lived access JWT (mobile default 1h). */
    accessExpiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '1h') as `${number}d` | `${number}m` | `${number}h`,
    webAccessExpiresIn: (process.env.JWT_WEB_ACCESS_EXPIRES_IN || '30m') as `${number}d` | `${number}m` | `${number}h`,
    /** Long-lived refresh token lifetime (opaque, hashed in session). */
    refreshExpiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '90d') as `${number}d` | `${number}m` | `${number}h`,
    oauthPendingExpiresIn: '1h' as const,
  },
  session: {
    /** Baseline biometric/OTP re-entry window when risk is low. */
    baseRotationMs: Number(process.env.SESSION_BASE_ROTATION_MS || 30 * 24 * 60 * 60 * 1000),
    /** Shortened window when unusual-activity signals fire. */
    shortRotationMs: Number(process.env.SESSION_SHORT_ROTATION_MS || 24 * 60 * 60 * 1000),
    /** Immediate step-up (force biometric/OTP before refresh). */
    forceStepUpMs: 0,
    /** Failed biometric attempts before forcing OTP. */
    biometricFailForceOtp: Number(process.env.SESSION_BIOMETRIC_FAIL_FORCE_OTP || 3),
  },
  google: {
    audiences: [
      process.env.GOOGLE_WEB_CLIENT_ID,
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
      process.env.VITE_GOOGLE_WEB_CLIENT_ID,
      process.env.VITE_GOOGLE_ANDROID_CLIENT_ID,
    ].filter((v): v is string => Boolean(v?.trim())),
  },
  apple: {
    audiences: [
      process.env.APPLE_IOS_BUNDLE_ID,
      process.env.APPLE_SIGNIN_AUDIENCE,
      process.env.IOS_BUNDLE_IDENTIFIER,
    ].filter((v): v is string => Boolean(v?.trim())),
  },
  email: {
    apiKey: process.env.RESEND_API_KEY || '',
    /** Default from (password reset, signup OTP, 2FA). See `email-from.config`. */
    from: getEmailFrom('default'),
  },
  otp: {
    ttlMs: 10 * 60 * 1000,
    signupProofTtlMs: 15 * 60 * 1000,
    resendCooldownMs: 30_000,
    maxVerifyAttempts: 8,
  },
  password: {
    minLength: 8,
    bcryptRounds: 10,
  },
  /**
   * Device attestation for mobile refresh / step-up.
   * DEVICE_ATTESTATION_MODE: off | mock | enforce
   * - off (default): skip — local/CI safe
   * - mock: accept tokens prefixed with novasafe-mock-attest:valid
   * - enforce: Play Integrity (Android) / App Attest|DeviceCheck (iOS)
   */
  attestation: {
    mode: (process.env.DEVICE_ATTESTATION_MODE || 'off').toLowerCase() as
      | 'off'
      | 'mock'
      | 'enforce',
    androidPackageName: process.env.ANDROID_PACKAGE_NAME || 'io.novasafe.mobile',
    iosBundleId:
      process.env.APPLE_IOS_BUNDLE_ID ||
      process.env.IOS_BUNDLE_IDENTIFIER ||
      'io.novasafe.mobile',
    appleTeamId: process.env.APPLE_TEAM_ID || '',
    /** Comma-separated base64url SHA-256 cert digests from Play Integrity appIntegrity.certificateSha256Digest */
    androidAllowedCertDigests: (process.env.ANDROID_ATTESTATION_CERT_DIGESTS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    /** Require MEETS_DEVICE_INTEGRITY (or stronger) when enforcing Android. */
    androidRequireDeviceIntegrity: process.env.ANDROID_REQUIRE_DEVICE_INTEGRITY !== 'false',
    appleDeviceCheckKeyId: process.env.APPLE_DEVICECHECK_KEY_ID || '',
    appleDeviceCheckPrivateKey: process.env.APPLE_DEVICECHECK_PRIVATE_KEY || '',
    appleDeviceCheckProduction: process.env.APPLE_DEVICECHECK_PRODUCTION === 'true',
  },
} as const;

export const assertAuthConfig = (): void => {
  if (!authConfig.jwt.secret) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }
};
