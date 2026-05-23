import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { assertAuthConfig, authConfig } from '../../../config/auth.config';
import type { DecodedAuthToken, OauthOtpProvider, TokenPair, UserPayload } from './token.types';

/**
 * JWT issuance and verification (compatible with mobile_vault tokens).
 */
export class JwtTokenService {
  generateAccessToken(user: UserPayload): TokenPair {
    assertAuthConfig();
    const tokenId = crypto.randomBytes(16).toString('hex');
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, picture: user.picture },
      authConfig.jwt.secret,
      {
        expiresIn: authConfig.jwt.accessExpiresIn,
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
