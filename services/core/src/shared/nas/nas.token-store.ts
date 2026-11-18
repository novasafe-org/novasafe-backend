import { COLLECTIONS } from '../../database/collections';
import { getNativeMongo } from '../../database/adapters/native-mongo.adapter';
import { decryptText, encryptText, type EncryptedPayload } from '../crypto';

export type NasStoredTokens = {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt: Date | null;
};

type MetadataDoc = {
  _id?: unknown;
  encryptedNasToken?: string;
  tokenExpiresAt?: Date | null;
  deleted?: boolean;
};

const db = () => getNativeMongo();

const parseEncryptedPayload = (raw: string): EncryptedPayload | null => {
  try {
    const parsed = JSON.parse(raw) as EncryptedPayload;
    if (!parsed?.encrypted_data || !parsed?.iv || !parsed?.authTag) return null;
    return parsed;
  } catch {
    return null;
  }
};

/**
 * Read decrypted NAS access (and optional refresh) token from `NovaSafe metadata`.
 */
export const readNasTokens = async (): Promise<NasStoredTokens | null> => {
  const doc = (await db().findOne(COLLECTIONS.novaSafeMetadata, {
    deleted: { $ne: true },
  })) as MetadataDoc | null;
  if (!doc?.encryptedNasToken) return null;

  const payload = parseEncryptedPayload(doc.encryptedNasToken);
  if (!payload) return null;
  const plain = decryptText(payload);
  if (!plain) return null;

  try {
    const parsed = JSON.parse(plain) as { access_token?: string; refresh_token?: string };
    if (!parsed.access_token) return null;
    return {
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token || undefined,
      tokenExpiresAt: doc.tokenExpiresAt ? new Date(doc.tokenExpiresAt) : null,
    };
  } catch {
    // Legacy: entire string was the access token
    return {
      accessToken: plain,
      tokenExpiresAt: doc.tokenExpiresAt ? new Date(doc.tokenExpiresAt) : null,
    };
  }
};

/**
 * Encrypt and upsert NAS tokens into the singleton metadata document.
 */
export const writeNasTokens = async (input: {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date | null;
}): Promise<void> => {
  const encrypted = encryptText(
    JSON.stringify({
      access_token: input.accessToken,
      refresh_token: input.refreshToken || '',
    }),
  );
  const encryptedNasToken = JSON.stringify(encrypted);
  const now = new Date();
  const tokenExpiresAt = input.tokenExpiresAt ?? null;

  const existing = (await db().findOne(COLLECTIONS.novaSafeMetadata, {
    deleted: { $ne: true },
  })) as MetadataDoc | null;

  if (existing?._id) {
    await db().updateOne(
      COLLECTIONS.novaSafeMetadata,
      { _id: existing._id },
      {
        $set: {
          encryptedNasToken,
          tokenExpiresAt,
          updatedAt: now,
          deleted: false,
        },
      },
    );
    return;
  }

  await db().insertOne(COLLECTIONS.novaSafeMetadata, {
    encryptedNasToken,
    tokenExpiresAt,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  });
};
