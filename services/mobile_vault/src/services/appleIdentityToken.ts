import { createHash } from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = new URL(`${APPLE_ISSUER}/auth/keys`);
const jwks = createRemoteJWKSet(APPLE_JWKS_URL);

export type AppleIdTokenClaims = {
  sub: string;
  email?: string;
  emailVerified: boolean;
};

const resolveAudiences = (): string[] => {
  const raw = [
    process.env.APPLE_IOS_BUNDLE_ID,
    process.env.APPLE_SIGNIN_AUDIENCE,
    process.env.IOS_BUNDLE_IDENTIFIER,
  ].filter((v): v is string => Boolean(v && String(v).trim()));

  const unique = Array.from(new Set(raw.map((s) => String(s).trim()).filter(Boolean)));
  return unique;
};

const isEmailVerifiedClaim = (value: unknown): boolean => {
  if (value === true) return true;
  if (value === 'true') return true;
  return false;
};

/** Apple places SHA256(nonce) in the ID token; compare using common encodings. */
const nonceMatchesTokenClaim = (rawNonce: string, tokenNonce: unknown): boolean => {
  if (typeof tokenNonce !== 'string' || !tokenNonce.trim()) return false;
  const digest = createHash('sha256').update(rawNonce, 'utf8').digest();
  const candidates = new Set<string>([
    digest.toString('hex'),
    digest.toString('base64'),
    digest.toString('base64url'),
    digest.toString('hex').toLowerCase(),
  ]);
  const normalized = tokenNonce.trim();
  return candidates.has(normalized) || candidates.has(normalized.toLowerCase());
};

/**
 * Verifies an Apple identity token (JWT) using Apple's JWKS.
 * `audiences` default from env: APPLE_IOS_BUNDLE_ID, APPLE_SIGNIN_AUDIENCE.
 */
export const verifyAppleIdentityToken = async (
  identityToken: string,
  options?: { audiences?: string[]; rawNonce?: string },
): Promise<AppleIdTokenClaims> => {
  const audiences = options?.audiences?.length ? options.audiences : resolveAudiences();
  if (!audiences.length) {
    throw new Error('Apple Sign In is not configured: set APPLE_IOS_BUNDLE_ID (or APPLE_SIGNIN_AUDIENCE) on the server');
  }

  const { payload } = await jwtVerify(identityToken, jwks, {
    issuer: APPLE_ISSUER,
    audience: audiences.length === 1 ? audiences[0] : audiences,
  });

  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!sub) {
    throw new Error('Apple identity token missing sub');
  }

  if (options?.rawNonce) {
    const claim = payload.nonce;
    if (!nonceMatchesTokenClaim(options.rawNonce, claim)) {
      throw new Error('Apple identity token nonce mismatch');
    }
  }

  const emailVerified = isEmailVerifiedClaim(payload.email_verified);
  const emailRaw = payload.email;
  const email =
    typeof emailRaw === 'string' && emailRaw.includes('@')
      ? emailRaw.toLowerCase().trim()
      : undefined;

  return { sub, email, emailVerified };
};
