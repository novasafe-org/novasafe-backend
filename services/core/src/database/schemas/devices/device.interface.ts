import type { Types } from 'mongoose';
import type { IBaseEntityDocument } from '../../core/base.entity';

export interface ITrustedDevice extends IBaseEntityDocument {
  userId: Types.ObjectId;
  deviceKey: string;
  deviceName?: string;
  platform?: string;
  userAgent?: string;
  trusted: boolean;
  isPrimary: boolean;
  isActive: boolean;
  lastSeenAt?: Date;
  pushToken?: string;
  source?: string;
  /**
   * Stable hardware-adjacent fingerprint (ANDROID_ID / identifierForVendor hash).
   * Survives app reinstall; used to recognize the same phone without consent.
   */
  hardwareFingerprint?: string | null;
  /** SHA-256 of the short-lived device trust token (never store plaintext). */
  trustTokenHash?: string | null;
  trustExpiresAt?: Date | null;
  /** Set when Not-me / explicit revoke / compromise — blocks silent resume. */
  compromisedAt?: Date | null;
}
