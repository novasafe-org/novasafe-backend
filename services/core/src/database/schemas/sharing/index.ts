export type { IShareRecord, IShareRecipient } from './sharing.interface';
export {
  SHARE_EXPIRY_DEFAULT_DAYS,
  SHARE_EXPIRY_PRESETS_DAYS,
  SHARE_MAX_RECIPIENTS,
  ShareRecipientStatus,
  ShareResourceType,
  ShareStatus,
} from './sharing.enums';
export type { ShareExpiryPresetDays } from './sharing.enums';
export { applySharingIndexes, SHARING_INDEX_SPECS } from './sharing.indexes';
export {
  SHARE_RECORD_COLLECTION,
  SHARE_RECORD_MODEL_NAME,
  ShareRecordSchema,
} from './share-record.schema';
