import mongoose, { type Model, type Schema } from 'mongoose';
import { COLLECTIONS } from '../collections';
import {
  AuditLogSchema,
  AUDIT_LOG_MODEL_NAME,
  ExportHistorySchema,
  EXPORT_HISTORY_MODEL_NAME,
} from '../schemas/audit';
import {
  OtpCodeSchema,
  OTP_CODE_MODEL_NAME,
  TwoFactorChallengeSchema,
  TWO_FACTOR_CHALLENGE_MODEL_NAME,
} from '../schemas/auth';
import {
  CustomFieldSchema,
  CUSTOM_FIELD_MODEL_NAME,
  PasswordHistorySchema,
  PASSWORD_HISTORY_MODEL_NAME,
  VaultItemSchema,
  VAULT_ITEM_MODEL_NAME,
} from '../schemas/vault';
import {
  SessionSchema,
  SESSION_MODEL_NAME,
} from '../schemas/sessions';
import {
  ShareRecordSchema,
  SHARE_RECORD_MODEL_NAME,
} from '../schemas/sharing';
import {
  EntitlementRecordSchema,
  ENTITLEMENT_RECORD_MODEL_NAME,
  PurchaseHistorySchema,
  PURCHASE_HISTORY_MODEL_NAME,
  SubscriptionEventSchema,
  SUBSCRIPTION_EVENT_MODEL_NAME,
  UserSubscriptionSchema,
  USER_SUBSCRIPTION_MODEL_NAME,
} from '../schemas/subscriptions';
import {
  VaultUserSchema,
  VAULT_USER_MODEL_NAME,
} from '../schemas/users';
import {
  DeviceSchema,
  DEVICE_MODEL_NAME,
} from '../schemas/devices';

export interface ModelRegistration {
  modelName: string;
  schema: Schema;
  collection: string;
}

const registrations: ModelRegistration[] = [
  { modelName: VAULT_USER_MODEL_NAME, schema: VaultUserSchema, collection: COLLECTIONS.vaultUsers },
  { modelName: VAULT_ITEM_MODEL_NAME, schema: VaultItemSchema, collection: COLLECTIONS.vaultItems },
  { modelName: PASSWORD_HISTORY_MODEL_NAME, schema: PasswordHistorySchema, collection: COLLECTIONS.passwordVersions },
  { modelName: CUSTOM_FIELD_MODEL_NAME, schema: CustomFieldSchema, collection: COLLECTIONS.customFields },
  { modelName: SESSION_MODEL_NAME, schema: SessionSchema, collection: COLLECTIONS.sessions },
  { modelName: DEVICE_MODEL_NAME, schema: DeviceSchema, collection: COLLECTIONS.devices },
  { modelName: OTP_CODE_MODEL_NAME, schema: OtpCodeSchema, collection: COLLECTIONS.otpCodes },
  { modelName: TWO_FACTOR_CHALLENGE_MODEL_NAME, schema: TwoFactorChallengeSchema, collection: COLLECTIONS.twoFactorChallenges },
  { modelName: SHARE_RECORD_MODEL_NAME, schema: ShareRecordSchema, collection: COLLECTIONS.shareRecords },
  { modelName: EXPORT_HISTORY_MODEL_NAME, schema: ExportHistorySchema, collection: COLLECTIONS.exportHistory },
  { modelName: USER_SUBSCRIPTION_MODEL_NAME, schema: UserSubscriptionSchema, collection: COLLECTIONS.subscriptions },
  { modelName: SUBSCRIPTION_EVENT_MODEL_NAME, schema: SubscriptionEventSchema, collection: COLLECTIONS.subscriptionEvents },
  { modelName: PURCHASE_HISTORY_MODEL_NAME, schema: PurchaseHistorySchema, collection: COLLECTIONS.purchaseHistory },
  { modelName: ENTITLEMENT_RECORD_MODEL_NAME, schema: EntitlementRecordSchema, collection: COLLECTIONS.entitlements },
  { modelName: AUDIT_LOG_MODEL_NAME, schema: AuditLogSchema, collection: COLLECTIONS.auditLogs },
];

/**
 * Central Mongoose model registry (singleton per process).
 */
export class ModelRegistry {
  private static initialized = false;

  static registerAll(): void {
    if (ModelRegistry.initialized) return;
    for (const { modelName, schema, collection } of registrations) {
      if (!mongoose.models[modelName]) {
        mongoose.model(modelName, schema, collection);
      }
    }
    ModelRegistry.initialized = true;
  }

  static get<T>(modelName: string): Model<T> {
    ModelRegistry.registerAll();
    const model = mongoose.models[modelName] as Model<T> | undefined;
    if (!model) {
      throw new Error(`Model not registered: ${modelName}`);
    }
    return model;
  }

  static listModelNames(): string[] {
    return registrations.map((r) => r.modelName);
  }
}
