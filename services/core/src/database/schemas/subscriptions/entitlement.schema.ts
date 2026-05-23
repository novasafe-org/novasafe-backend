import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { userIdField } from '../common/user-reference.schema';
import type { IEntitlementRecord } from './subscription.interface';

/** Placeholder collection for cached entitlement rows (future sync from RevenueCat). */
const entitlementDefinition = {
  ...userIdField,
  entitlementId: { type: String, required: true },
  isActive: { type: Boolean, default: false, index: true },
  expiresAt: { type: Date, default: null },
  productId: { type: String, default: null },
  raw: { type: Object, default: {} },
};

export const EntitlementRecordSchema = createBaseSchema(entitlementDefinition);

EntitlementRecordSchema.index({ userId: 1, entitlementId: 1 }, { unique: true });

export const ENTITLEMENT_RECORD_MODEL_NAME = 'EntitlementRecord';
export const ENTITLEMENT_RECORD_COLLECTION = COLLECTIONS.entitlements;

export type { IEntitlementRecord };
