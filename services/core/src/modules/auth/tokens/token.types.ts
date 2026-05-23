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
  oauthOtpProvider?: OauthOtpProvider;
};

export interface TokenPair {
  token: string;
  tokenId: string;
}
