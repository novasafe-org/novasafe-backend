import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { deviceInfoFields } from '../common/device-info.schema';
import { requestContextAuditFields } from '../common/request-context-audit.schema';
import { sourceField } from '../common/source-tracking.schema';
import { partialIndexActiveSession } from '../common/indexes.util';
import { userIdField } from '../common/user-reference.schema';
import type { ISession } from './session.interface';

const sessionDefinition = {
  ...userIdField,
  tokenId: { type: String, required: true },
  revoked: { type: Boolean, default: false },
  revokedAt: { type: Date, default: null },
  lastActivity: { type: Date, default: Date.now },
  ...deviceInfoFields,
  ...sourceField,
  ...requestContextAuditFields,
  refreshTokenHash: { type: String, default: null },
  refreshExpiresAt: { type: Date, default: null },
  refreshRotatedAt: { type: Date, default: null },
  deviceFingerprint: { type: String, default: null },
  osVersion: { type: String, default: null },
  lastIpPrefix: { type: String, default: null },
  lastGeoCountry: { type: String, default: null },
  lastGeoRegion: { type: String, default: null },
  biometricFailCount: { type: Number, default: 0 },
  rotationIntervalMs: { type: Number, default: null },
  nextRotationAt: { type: Date, default: null },
  riskSignals: { type: [String], default: [] },
  preferredStepUp: { type: String, default: null },
};

export const SessionSchema = createBaseSchema(sessionDefinition);

SessionSchema.index({ userId: 1, revoked: 1, lastActivity: -1 });
SessionSchema.index({ tokenId: 1 }, { unique: true, partialFilterExpression: partialIndexActiveSession });
SessionSchema.index(
  { refreshTokenHash: 1 },
  { unique: true, partialFilterExpression: { refreshTokenHash: { $type: 'string' } } },
);

export const SESSION_MODEL_NAME = 'Session';
export const SESSION_COLLECTION = COLLECTIONS.sessions;

export type { ISession };
