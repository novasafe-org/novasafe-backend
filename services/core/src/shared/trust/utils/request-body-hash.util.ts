import { createHash } from 'node:crypto';

/** Stable body hash for HMAC signing (empty body → empty string hash). */
export const hashRequestBody = (body: unknown): string => {
  let serialized = '';
  if (body !== undefined && body !== null) {
    try {
      serialized = typeof body === 'string' ? body : JSON.stringify(body);
    } catch {
      serialized = '';
    }
  }
  return createHash('sha256').update(serialized).digest('hex');
};
