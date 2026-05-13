import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export interface UserPayload {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  jti?: string;
}

export type AuthTokenType = 'oauth_otp_pending';

export type OauthOtpProvider = 'google' | 'apple';

export type DecodedAuthToken = UserPayload & {
  jti?: string;
  tokenType?: AuthTokenType;
  /** Present when `tokenType` is `oauth_otp_pending` (which OAuth flow triggered NovaSafe email OTP). */
  oauthOtpProvider?: OauthOtpProvider;
};

export const generateToken = (user: UserPayload): { token: string; tokenId: string } => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is not configured');
  const tokenId = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, picture: user.picture },
    process.env.JWT_SECRET,
    { expiresIn: '7d', issuer: 'vault-backend', audience: 'vault-frontend', jwtid: tokenId }
  );
  return { token, tokenId };
};

/** Short-lived JWT: may only call OAuth email OTP verify/resend (not vault APIs). */
export const generateOauthPendingToken = (
  user: UserPayload,
  oauthOtpProvider: OauthOtpProvider = 'google',
): { token: string; tokenId: string } => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is not configured');
  const tokenId = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      tokenType: 'oauth_otp_pending' as const,
      oauthOtpProvider,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h', issuer: 'vault-backend', audience: 'vault-frontend', jwtid: tokenId }
  );
  return { token, tokenId };
};

export const verifyToken = (token: string): DecodedAuthToken => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is not configured');
  return jwt.verify(token, process.env.JWT_SECRET, {
    issuer: 'vault-backend',
    audience: 'vault-frontend',
  }) as DecodedAuthToken;
};
