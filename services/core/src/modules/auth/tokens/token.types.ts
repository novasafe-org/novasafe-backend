export interface UserPayload {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  jti?: string;
}

export type AuthTokenType = 'oauth_otp_pending' | 'google_signup_intent';

export type OauthOtpProvider = 'google' | 'apple';

export type DecodedAuthToken = UserPayload & {
  jti?: string;
  tokenType?: AuthTokenType;
  oauthOtpProvider?: OauthOtpProvider;
  googleSub?: string;
};

export interface TokenPair {
  token: string;
  tokenId: string;
}
