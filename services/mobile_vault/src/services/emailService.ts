import { Resend } from 'resend';
import logger from '../logger';

interface EmailConfig {
  apiKey: string;
  from: string;
}

let resendClient: Resend | null = null;

const getConfig = (): EmailConfig => ({
  apiKey: process.env.RESEND_API_KEY || '',
  from:
    process.env.RESEND_FROM ||
    process.env.SMTP_FROM ||
    process.env.SUBSCRIPTION_EMAIL_FROM ||
    'no-reply@novasafe.io',
});

const getResendClient = (): Resend | null => {
  if (resendClient) return resendClient;
  const cfg = getConfig();
  if (!cfg.apiKey) {
    logger.error('RESEND_API_KEY not configured. Email sending disabled.');
    return null;
  }
  resendClient = new Resend(cfg.apiKey);
  logger.info('Resend client initialized');
  return resendClient;
};

export const sendMail = async (
  to: string,
  subject: string,
  html: string,
  text: string,
  options?: { from?: string },
): Promise<boolean> => {
  const client = getResendClient();
  if (!client) return false;
  try {
    const cfg = getConfig();
    const result = await client.emails.send({
      from: options?.from || cfg.from,
      to,
      subject,
      html,
      text, // keep plain-text for client compatibility
    });
    logger.info({ to, messageId: result?.data?.id }, 'Email sent via Resend');
    return true;
  } catch (error: any) {
    logger.error({ to, error: error?.message }, 'Failed to send email');
    return false;
  }
};

export const sendSignupOTPEmail = async (email: string, otp: string): Promise<boolean> => {
  return sendMail(
    email,
    'Your NovaSafe signup OTP',
    `
      <div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f4f7fb;padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e8edf5;">
          <h1 style="margin:0 0 8px;color:#0f172a;font-size:24px;">Welcome to NovaSafe</h1>
          <p style="margin:0 0 18px;color:#475569;">Use this one-time code to complete your sign up.</p>
          <div style="background:#eef9f7;border:1px solid #c8ece6;color:#0f766e;padding:16px;border-radius:12px;text-align:center;">
            <span style="font-size:28px;letter-spacing:6px;font-weight:700;">${otp}</span>
          </div>
          <p style="color:#64748b;font-size:13px;margin-top:16px;">Code expires in 10 minutes. If this was not you, ignore this email.</p>
        </div>
      </div>
    `,
    `Your NovaSafe OTP is ${otp}. This code expires in 10 minutes.`,
  );
};

export const sendTwoFactorEmail = async (email: string, code: string): Promise<boolean> => {
  return sendMail(
    email,
    'Your NovaSafe 2FA code',
    `
      <div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f4f7fb;padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e8edf5;">
          <h1 style="margin:0 0 8px;color:#0f172a;font-size:24px;">Two-Factor Verification</h1>
          <p style="margin:0 0 18px;color:#475569;">Enter this code to continue logging in.</p>
          <div style="background:#f0f9ff;border:1px solid #c9ecff;color:#0c4a6e;padding:16px;border-radius:12px;text-align:center;">
            <span style="font-size:28px;letter-spacing:6px;font-weight:700;">${code}</span>
          </div>
          <p style="color:#64748b;font-size:13px;margin-top:16px;">Code expires in 10 minutes. Never share this code.</p>
        </div>
      </div>
    `,
    `Your NovaSafe 2FA code is ${code}. This code expires in 10 minutes.`,
  );
};

export const sendShareInviteEmail = async (
  toEmail: string,
  senderName: string,
  itemName: string,
  permission: string,
): Promise<boolean> => {
  return sendMail(
    toEmail,
    `${senderName} shared an item with you on NovaSafe`,
    `
      <div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f4f7fb;padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e8edf5;">
          <h1 style="margin:0 0 8px;color:#0f172a;font-size:24px;">Item Shared With You</h1>
          <p style="margin:0 0 18px;color:#475569;"><b>${senderName}</b> shared an item from NovaSafe.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:14px;border-radius:12px;">
            <p style="margin:0;color:#0f172a;"><b>Item:</b> ${itemName}</p>
            <p style="margin:8px 0 0;color:#334155;"><b>Permission:</b> ${permission}</p>
          </div>
        </div>
      </div>
    `,
    `${senderName} shared ${itemName} with you on NovaSafe. Permission: ${permission}.`,
  );
};
