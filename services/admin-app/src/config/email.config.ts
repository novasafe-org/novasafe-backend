/**
 * Transactional email (Resend) — same env vars as core service.
 */
export const emailConfig = {
  apiKey: process.env.RESEND_API_KEY || '',
  from:
    process.env.RESEND_FROM ||
    process.env.SMTP_FROM ||
    process.env.SUBSCRIPTION_EMAIL_FROM ||
    'no-reply@novasafe.io',
} as const;

export const isEmailConfigured = (): boolean => Boolean(emailConfig.apiKey.trim());
