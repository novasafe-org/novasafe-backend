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
  code: 'NOVASAFE_DEVICE_LIMIT';
  message: string;
  entitlement: 'canUseMultiDevice';
  subscription: unknown;
  devicePolicy: DevicePolicyDto;
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
