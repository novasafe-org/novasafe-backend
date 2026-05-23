/**
 * Auth configuration (ported from mobile_vault; env-driven).
 */
export const authConfig = {
  jwt: {
    secret: process.env.JWT_SECRET || '',
    issuer: 'vault-backend',
    audience: 'vault-frontend',
    accessExpiresIn: '7d' as const,
    oauthPendingExpiresIn: '1h' as const,
  },
  google: {
    audiences: [
      process.env.GOOGLE_WEB_CLIENT_ID,
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
      process.env.VITE_GOOGLE_WEB_CLIENT_ID,
      process.env.VITE_GOOGLE_ANDROID_CLIENT_ID,
    ].filter((v): v is string => Boolean(v?.trim())),
  },
  apple: {
    audiences: [
      process.env.APPLE_IOS_BUNDLE_ID,
      process.env.APPLE_SIGNIN_AUDIENCE,
      process.env.IOS_BUNDLE_IDENTIFIER,
    ].filter((v): v is string => Boolean(v?.trim())),
  },
  email: {
    apiKey: process.env.RESEND_API_KEY || '',
    from:
      process.env.RESEND_FROM ||
      process.env.SMTP_FROM ||
      process.env.SUBSCRIPTION_EMAIL_FROM ||
      'no-reply@novasafe.io',
  },
  otp: {
    ttlMs: 10 * 60 * 1000,
    resendCooldownMs: 30_000,
    maxVerifyAttempts: 8,
  },
  password: {
    minLength: 8,
    bcryptRounds: 10,
  },
} as const;

export const assertAuthConfig = (): void => {
  if (!authConfig.jwt.secret) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }
};
