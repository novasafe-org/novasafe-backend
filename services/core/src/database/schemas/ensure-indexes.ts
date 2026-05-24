import { ModelRegistry } from '../models/model.registry';
import { applyAuditIndexes } from './audit';
import { EXPORT_HISTORY_MODEL_NAME } from './audit/export-history.schema';
import { applyAuthIndexes } from './auth';
import { OTP_CODE_MODEL_NAME, TWO_FACTOR_CHALLENGE_MODEL_NAME } from './auth';
import { applySessionIndexes } from './sessions';
import { SESSION_MODEL_NAME } from './sessions';
import { applySharingIndexes } from './sharing';
import { SHARE_RECORD_MODEL_NAME } from './sharing';
import { applySubscriptionIndexes } from './subscriptions';
import {
  ENTITLEMENT_RECORD_MODEL_NAME,
  PURCHASE_HISTORY_MODEL_NAME,
  SUBSCRIPTION_EVENT_MODEL_NAME,
  USER_SUBSCRIPTION_MODEL_NAME,
} from './subscriptions';
import { applyVaultIndexes } from './vault';
import {
  CUSTOM_FIELD_MODEL_NAME,
  PASSWORD_HISTORY_MODEL_NAME,
  VAULT_ITEM_MODEL_NAME,
} from './vault';
import { applyVaultUserIndexes } from './users';
import { VAULT_USER_MODEL_NAME } from './users';
import { applyDeviceIndexes } from './devices';
import { DEVICE_MODEL_NAME } from './devices';

/**
 * Ensures MongoDB indexes for all registered schemas.
 * Call after database connection is established (e.g. during startup).
 */
export const ensureAllSchemaIndexes = async (): Promise<void> => {
  ModelRegistry.registerAll();

  await applyVaultUserIndexes(ModelRegistry.get(VAULT_USER_MODEL_NAME));

  await applyVaultIndexes(
    ModelRegistry.get(VAULT_ITEM_MODEL_NAME),
    ModelRegistry.get(PASSWORD_HISTORY_MODEL_NAME),
    ModelRegistry.get(CUSTOM_FIELD_MODEL_NAME),
  );

  await applyAuthIndexes(
    ModelRegistry.get(OTP_CODE_MODEL_NAME),
    ModelRegistry.get(TWO_FACTOR_CHALLENGE_MODEL_NAME),
  );

  await applySessionIndexes(ModelRegistry.get(SESSION_MODEL_NAME));
  await applyDeviceIndexes(ModelRegistry.get(DEVICE_MODEL_NAME));
  await applySharingIndexes(ModelRegistry.get(SHARE_RECORD_MODEL_NAME));
  await applyAuditIndexes(ModelRegistry.get(EXPORT_HISTORY_MODEL_NAME));

  await applySubscriptionIndexes({
    subscription: ModelRegistry.get(USER_SUBSCRIPTION_MODEL_NAME),
    subscriptionEvent: ModelRegistry.get(SUBSCRIPTION_EVENT_MODEL_NAME),
    purchaseHistory: ModelRegistry.get(PURCHASE_HISTORY_MODEL_NAME),
    entitlement: ModelRegistry.get(ENTITLEMENT_RECORD_MODEL_NAME),
  });
};
