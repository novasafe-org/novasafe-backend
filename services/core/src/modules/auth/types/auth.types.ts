import type { OauthOtpProvider } from '../tokens/token.types';

export interface AuthUserDto {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface DevicePolicyDto {
  canRegisterNewDevice: boolean;
  trustedDeviceCount: number;
  maxTrustedDevices: number;
  isPro: boolean;
}

export type SessionStepUpPreferred = 'biometric' | 'otp' | null;

export interface SessionPolicyDto {
  nextRotationAt: string;
  rotationIntervalMs: number;
  requiresStepUp: SessionStepUpPreferred;
  riskSignals: string[];
}

/** Present when this login is on an untrusted device awaiting It’s me / Not me. */
export interface PendingDeviceConsentDto {
  alertId: string;
  deviceKey: string;
  deviceName: string;
  platform: string;
  status: 'pending';
}

export interface AuthSuccessResponse {
  success: true;
  source?: string;
  token: string;
  accessToken: string;
  refreshToken: string | null;
  user: AuthUserDto;
  requiresMasterPasswordSetup?: boolean;
  requiresVaultSetup?: boolean;
  oauthIntent?: string;
  devicePolicy?: DevicePolicyDto;
  sessionPolicy?: SessionPolicyDto;
  /** Untrusted device B must show the allow-login waiting interstitial. */
  pendingDeviceConsent?: PendingDeviceConsentDto | null;
}

/** @deprecated Use AuthDeviceBlockedResponse — kept for client compatibility */
export interface AuthSubscriptionBlockedResponse {
  success: false;
  source?: string;
  code: 'NOVASAFE_SUBSCRIPTION_REQUIRED' | 'NOVASAFE_DEVICE_LIMIT';
  message: string;
  entitlement: string;
  subscription: unknown;
  devicePolicy?: DevicePolicyDto;
}

export interface AuthDeviceBlockedResponse {
  success: false;
  source?: string;
  code: 'NOVASAFE_DEVICE_LIMIT' | 'NOVASAFE_SINGLE_DEVICE_LOGIN';
  message: string;
  entitlement: 'canUseMultiDevice';
  subscription: unknown;
  devicePolicy: DevicePolicyDto;
  /** Present when the client should show the New Device Login / switch-device prompt. */
  conflict?: {
    deviceName: string;
    platform: string;
    locationLabel?: string | null;
    time?: string | null;
    sessionId?: string | null;
  };
}

export type VaultOAuthUserRow = {
  _id: { toString(): string };
  email: string;
  name?: string;
  picture?: string;
  avatar_url?: string;
  novasafeEmailVerified?: boolean | null;
  passwordHash?: string;
  has_password?: boolean;
  isFirstOAuthSignup?: boolean;
  auth_methods?: unknown;
  auth_provider?: string;
  provider_id?: string;
  googleId?: string;
  appleId?: string;
  deleted?: boolean;
  twoFactorEnabled?: boolean;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserDto;
      tokenId?: string;
      oauthOtpPending?: boolean;
      oauthOtpProvider?: OauthOtpProvider;
    }
  }
}
