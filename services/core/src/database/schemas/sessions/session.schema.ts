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
};

export const SessionSchema = createBaseSchema(sessionDefinition);

SessionSchema.index({ userId: 1, revoked: 1, lastActivity: -1 });
SessionSchema.index({ tokenId: 1 }, { unique: true, partialFilterExpression: partialIndexActiveSession });

export const SESSION_MODEL_NAME = 'Session';
export const SESSION_COLLECTION = COLLECTIONS.sessions;

export type { ISession };
