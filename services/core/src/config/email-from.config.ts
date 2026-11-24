/**
 * Resend/SMTP from-addresses by email use case.
 *
 * Defaults:
 * - Signup + password reset → `RESEND_FROM` / onboarding@novasafe.io
 * - Operational (default, 2FA, item sharing, subscription) → no-reply@novasafe.io
 */

/** Account / onboarding mail (signup OTP, password reset). */
const onboardingFrom =
  process.env.RESEND_FROM || process.env.SMTP_FROM || 'onboarding@novasafe.io';

/** Operational / system mail fallback. */
const noReplyFrom = 'no-reply@novasafe.io';

export const EMAIL_FROM_USE_CASES = [
  'default',
  'password_reset',
  'signup',
  'two_factor',
  'item_sharing',
  'subscription',
] as const;

export type EmailFromUseCase = (typeof EMAIL_FROM_USE_CASES)[number];

/**
 * From-address per use case. Prefer use-case env overrides; otherwise use
 * onboarding for signup/reset and no-reply for everything else.
 */
export const emailFromByUseCase: Record<EmailFromUseCase, string> = {
  default: process.env.RESEND_FROM_DEFAULT || noReplyFrom,
  password_reset: process.env.RESEND_FROM_PASSWORD_RESET || onboardingFrom,
  signup: process.env.RESEND_FROM_SIGNUP || onboardingFrom,
  two_factor: process.env.RESEND_FROM_TWO_FACTOR || noReplyFrom,
  item_sharing:
    process.env.RESEND_FROM_SHARE || process.env.SHARE_EMAIL_FROM || noReplyFrom,
  subscription: process.env.SUBSCRIPTION_EMAIL_FROM || noReplyFrom,
};

export const getEmailFrom = (useCase: EmailFromUseCase): string =>
  emailFromByUseCase[useCase] || emailFromByUseCase.default;
