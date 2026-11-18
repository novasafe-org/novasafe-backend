import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';

/**
 * Platform metadata for NAS-Control agent auth.
 * Token encryption/decryption lives in services — not wired yet.
 */
const novaSafeMetadataDefinition = {
  /** Ciphertext of the NAS agent authentication token. */
  encryptedNasToken: { type: String, required: true },
  /** When the stored NAS token expires (null if unknown / non-expiring). */
  tokenExpiresAt: { type: Date, default: null },
};

export const NovaSafeMetadataSchema = createBaseSchema(novaSafeMetadataDefinition);

export const NOVA_SAFE_METADATA_MODEL_NAME = 'NovaSafeMetadata';
export const NOVA_SAFE_METADATA_COLLECTION = COLLECTIONS.novaSafeMetadata;
