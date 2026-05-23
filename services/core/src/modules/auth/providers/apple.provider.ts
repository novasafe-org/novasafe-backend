import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { authConfig } from '../../../config/auth.config';

const APPLE_ISSUER = 'https://appleid.apple.com';
const jwks = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`));

export type AppleIdTokenClaims = {
  sub: string;
  email?: string;
  emailVerified: boolean;
};

const isEmailVerifiedClaim = (value: unknown): boolean => value === true || value === 'true';

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

export class AppleAuthProvider {
  async verifyIdentityToken(identityToken: string, rawNonce: string): Promise<AppleIdTokenClaims> {
    const audiences = authConfig.apple.audiences;
    if (!audiences.length) {
      throw new Error('Apple Sign In is not configured: set APPLE_IOS_BUNDLE_ID on the server');
    }
    const { payload } = await jwtVerify(identityToken, jwks, {
      issuer: APPLE_ISSUER,
      audience: audiences.length === 1 ? audiences[0] : audiences,
    });
    const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
    if (!sub) throw new Error('Apple identity token missing sub');
    if (!nonceMatchesTokenClaim(rawNonce, payload.nonce)) {
      throw new Error('Apple identity token nonce mismatch');
    }
    const emailRaw = payload.email;
    const email =
      typeof emailRaw === 'string' && emailRaw.includes('@')
        ? emailRaw.toLowerCase().trim()
        : undefined;
    return { sub, email, emailVerified: isEmailVerifiedClaim(payload.email_verified) };
  }
}

let appleProvider: AppleAuthProvider | null = null;
export const getAppleAuthProvider = (): AppleAuthProvider => {
  if (!appleProvider) appleProvider = new AppleAuthProvider();
  return appleProvider;
};
