import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { assertAuthConfig, authConfig } from '../../../config/auth.config';
import type { DecodedAuthToken, OauthOtpProvider, TokenPair, UserPayload } from './token.types';

/**
 * JWT issuance and verification (compatible with mobile_vault tokens).
 */
export class JwtTokenService {
  generateAccessToken(user: UserPayload, options?: { expiresIn?: string }): TokenPair {
    assertAuthConfig();
    const tokenId = crypto.randomBytes(16).toString('hex');
    const expiresIn = (options?.expiresIn ?? authConfig.jwt.accessExpiresIn) as SignOptions['expiresIn'];
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, picture: user.picture },
      authConfig.jwt.secret,
      {
        expiresIn,
        issuer: authConfig.jwt.issuer,
        audience: authConfig.jwt.audience,
        jwtid: tokenId,
      },
    );
    return { token, tokenId };
  }

  generateOauthPendingToken(user: UserPayload, oauthOtpProvider: OauthOtpProvider): TokenPair {
    assertAuthConfig();
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
      authConfig.jwt.secret,
      {
        expiresIn: authConfig.jwt.oauthPendingExpiresIn,
        issuer: authConfig.jwt.issuer,
        audience: authConfig.jwt.audience,
        jwtid: tokenId,
      },
    );
    return { token, tokenId };
  }

  generateGoogleSignupIntentToken(payload: {
    googleSub: string;
    email: string;
    name?: string;
    picture?: string;
  }): string {
    assertAuthConfig();
    return jwt.sign(
      {
        tokenType: 'google_signup_intent' as const,
        googleSub: payload.googleSub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        id: payload.googleSub,
      },
      authConfig.jwt.secret,
      {
        expiresIn: authConfig.otp.signupProofTtlMs / 1000,
        issuer: authConfig.jwt.issuer,
        audience: authConfig.jwt.audience,
      },
    );
  }

  verifyGoogleSignupIntentToken(token: string): {
    googleSub: string;
    email: string;
    name?: string;
    picture?: string;
  } {
    assertAuthConfig();
    const decoded = jwt.verify(token, authConfig.jwt.secret, {
      issuer: authConfig.jwt.issuer,
      audience: authConfig.jwt.audience,
    }) as DecodedAuthToken;
    if (decoded.tokenType !== 'google_signup_intent' || !decoded.googleSub || !decoded.email) {
      throw new Error('Invalid Google signup intent token');
    }
    return {
      googleSub: decoded.googleSub,
      email: decoded.email.toLowerCase().trim(),
      name: decoded.name,
      picture: decoded.picture,
    };
  }

  verify(token: string): DecodedAuthToken {
    assertAuthConfig();
    return jwt.verify(token, authConfig.jwt.secret, {
      issuer: authConfig.jwt.issuer,
      audience: authConfig.jwt.audience,
    }) as DecodedAuthToken;
  }
}

let tokenServiceInstance: JwtTokenService | null = null;

export const getJwtTokenService = (): JwtTokenService => {
  if (!tokenServiceInstance) tokenServiceInstance = new JwtTokenService();
  return tokenServiceInstance;
};
