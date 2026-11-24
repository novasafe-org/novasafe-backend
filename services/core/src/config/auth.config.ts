/**
 * Auth configuration (ported from mobile_vault; env-driven).
 */
import { getEmailFrom } from './email-from.config';

export const authConfig = {
  jwt: {
    /**
     * Read at access time (not import time) so unit tests / CI can set
     * `JWT_SECRET` in `before()` after modules load.
     */
    get secret(): string {
      return process.env.JWT_SECRET || '';
    },
    issuer: 'vault-backend',
    audience: 'vault-frontend',
    /** Short-lived access JWT (mobile default 1h). */
    get accessExpiresIn(): `${number}d` | `${number}m` | `${number}h` {
      return (process.env.JWT_ACCESS_EXPIRES_IN || '1h') as `${number}d` | `${number}m` | `${number}h`;
    },
    get webAccessExpiresIn(): `${number}d` | `${number}m` | `${number}h` {
      return (process.env.JWT_WEB_ACCESS_EXPIRES_IN || '30m') as `${number}d` | `${number}m` | `${number}h`;
    },
    /** Long-lived refresh token lifetime (opaque, hashed in session). */
    get refreshExpiresIn(): `${number}d` | `${number}m` | `${number}h` {
      return (process.env.JWT_REFRESH_EXPIRES_IN || '90d') as `${number}d` | `${number}m` | `${number}h`;
    },
    oauthPendingExpiresIn: '1h' as const,
  },
  session: {
    /** Baseline biometric/OTP re-entry window when risk is low. */
    get baseRotationMs(): number {
      return Number(process.env.SESSION_BASE_ROTATION_MS || 30 * 24 * 60 * 60 * 1000);
    },
    /** Shortened window when unusual-activity signals fire. */
    get shortRotationMs(): number {
      return Number(process.env.SESSION_SHORT_ROTATION_MS || 24 * 60 * 60 * 1000);
    },
    /** Immediate step-up (force biometric/OTP before refresh). */
    forceStepUpMs: 0,
    /** Failed biometric attempts before forcing OTP. */
    get biometricFailForceOtp(): number {
      return Number(process.env.SESSION_BIOMETRIC_FAIL_FORCE_OTP || 3);
    },
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
    get mode(): 'off' | 'mock' | 'enforce' {
      return (process.env.DEVICE_ATTESTATION_MODE || 'off').toLowerCase() as
        | 'off'
        | 'mock'
        | 'enforce';
    },
    get androidPackageName(): string {
      return process.env.ANDROID_PACKAGE_NAME || 'io.novasafe.mobile';
    },
    get iosBundleId(): string {
      return (
        process.env.APPLE_IOS_BUNDLE_ID ||
        process.env.IOS_BUNDLE_IDENTIFIER ||
        'io.novasafe.mobile'
      );
    },
    get appleTeamId(): string {
      return process.env.APPLE_TEAM_ID || '';
    },
    /** Comma-separated base64url SHA-256 cert digests from Play Integrity appIntegrity.certificateSha256Digest */
    get androidAllowedCertDigests(): string[] {
      return (process.env.ANDROID_ATTESTATION_CERT_DIGESTS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    },
    /** Require MEETS_DEVICE_INTEGRITY (or stronger) when enforcing Android. */
    get androidRequireDeviceIntegrity(): boolean {
      return process.env.ANDROID_REQUIRE_DEVICE_INTEGRITY !== 'false';
    },
    get appleDeviceCheckKeyId(): string {
      return process.env.APPLE_DEVICECHECK_KEY_ID || '';
    },
    get appleDeviceCheckPrivateKey(): string {
      return process.env.APPLE_DEVICECHECK_PRIVATE_KEY || '';
    },
    get appleDeviceCheckProduction(): boolean {
      return process.env.APPLE_DEVICECHECK_PRODUCTION === 'true';
    },
  },
};

export const assertAuthConfig = (): void => {
  if (!authConfig.jwt.secret) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }
};
