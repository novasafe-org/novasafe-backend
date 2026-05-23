import type { Types } from 'mongoose';
import type { IBaseEntityDocument } from '../../core/base.entity';

export interface ISession extends IBaseEntityDocument {
  userId: Types.ObjectId;
  tokenId: string;
  revoked: boolean;
  revokedAt?: Date;
  source?: string;
  ipAddress?: string;
  deviceName?: string;
  platform?: string;
  userAgent?: string;
  locationLabel?: string;
  lastActivity?: Date;
  clientSource?: string;
  declaredSource?: string;
  verifiedSource?: string | null;
  trustLevel?: string;
  clientPlatform?: string;
  legacySource?: string;
  appVersion?: string;
  buildVersion?: string;
  deviceId?: string;
  requestId?: string;
  traceId?: string;
  correlationId?: string;
  sessionId?: string;
  region?: string;
  tenantId?: string;
}
