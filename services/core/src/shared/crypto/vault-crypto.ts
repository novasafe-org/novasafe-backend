import crypto from 'crypto';

const MASTER_KEY =
  process.env.MOBILE_VAULT_MASTER_KEY ||
  process.env.SERVER_MASTER_KEY ||
  'novasafe-mobile-default-master-key';

const KEY = crypto.createHash('sha256').update(MASTER_KEY).digest();

export interface EncryptedPayload {
  encrypted_data: string;
  iv: string;
  authTag: string;
}

export const encryptPayload = (data: Record<string, unknown>): EncryptedPayload => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted_data: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
};

export const decryptPayload = (input: {
  encrypted_data?: string;
  iv?: string;
  authTag?: string;
}): Record<string, unknown> | null => {
  if (!input?.encrypted_data || !input?.iv || !input?.authTag) return null;
  try {
    const iv = Buffer.from(input.iv, 'base64');
    const authTag = Buffer.from(input.authTag, 'base64');
    const encrypted = Buffer.from(input.encrypted_data, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const encryptText = (value: string): EncryptedPayload => encryptPayload({ value });

export const decryptText = (input: {
  encrypted_data?: string;
  iv?: string;
  authTag?: string;
}): string | null => {
  const out = decryptPayload(input);
  if (!out || typeof out.value !== 'string') return null;
  return out.value;
};
