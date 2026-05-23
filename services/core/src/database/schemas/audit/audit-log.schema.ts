import { Schema } from 'mongoose';
import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { requestContextAuditFields } from '../common/request-context-audit.schema';
import { sourceField } from '../common/source-tracking.schema';
import { optionalUserIdField } from '../common/user-reference.schema';

/** Placeholder for platform-wide audit trail (future admin module). */
const auditLogDefinition = {
  ...optionalUserIdField,
  action: { type: String, required: true, index: true },
  resourceType: { type: String, default: null, index: true },
  resourceId: { type: Schema.Types.ObjectId, default: null },
  outcome: { type: String, enum: ['success', 'failure'], default: 'success' },
  ipAddress: { type: String, default: null },
  userAgent: { type: String, default: null },
  details: { type: Schema.Types.Mixed, default: {} },
  ...sourceField,
  ...requestContextAuditFields,
};

export const AuditLogSchema = createBaseSchema(auditLogDefinition);

AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

export const AUDIT_LOG_MODEL_NAME = 'AuditLog';
export const AUDIT_LOG_COLLECTION = COLLECTIONS.auditLogs;
