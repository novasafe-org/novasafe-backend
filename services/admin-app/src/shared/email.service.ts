import { Resend } from 'resend';

import { emailConfig } from '../config/email.config';
import { logger } from './logger';

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (resendClient) return resendClient;
  if (!emailConfig.apiKey) {
    logger.warn('RESEND_API_KEY not configured — admin email sending disabled');
    return null;
  }
  resendClient = new Resend(emailConfig.apiKey);
  return resendClient;
}

export async function sendMail(
  to: string,
  subject: string,
  html: string,
  text: string,
  options?: { from?: string },
): Promise<boolean> {
  const client = getResendClient();
  if (!client) return false;
  try {
    const result = await client.emails.send({
      from: options?.from || emailConfig.from,
      to,
      subject,
      html,
      text,
    });
    logger.info('Admin email sent via Resend', { to, messageId: result?.data?.id });
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send admin email', { to, error: message });
    return false;
  }
}

const emailShell = (title: string, bodyHtml: string, footer: string) =>
  `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f4f7fb;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e8edf5;">
      <p style="margin:0 0 16px;color:#64748b;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">NovaSafe Admin</p>
      <h1 style="margin:0 0 8px;color:#0f172a;font-size:24px;">${title}</h1>
      ${bodyHtml}
      <p style="color:#64748b;font-size:13px;margin-top:20px;">${footer}</p>
    </div>
  </div>`;

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<boolean> {
  const bodyHtml = `
    <p style="margin:0 0 18px;color:#475569;">We received a request to reset your admin account password.</p>
    <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Reset password</a>
    <p style="margin:16px 0 0;color:#64748b;font-size:13px;">Or copy this link:<br/><span style="word-break:break-all;color:#334155;">${resetUrl}</span></p>`;

  return sendMail(
    email,
    'Reset your NovaSafe Admin password',
    emailShell(
      'Reset your password',
      bodyHtml,
      'This link expires in 1 hour. If you did not request this, you can ignore this email.',
    ),
    `Reset your NovaSafe Admin password: ${resetUrl}\n\nThis link expires in 1 hour.`,
  );
}

export async function sendTeamInviteEmail(
  toEmail: string,
  inviteUrl: string,
  roleKey: string,
  inviterName: string,
): Promise<boolean> {
  const roleLabel = roleKey.charAt(0).toUpperCase() + roleKey.slice(1);
  const bodyHtml = `
    <p style="margin:0 0 18px;color:#475569;"><b>${inviterName}</b> invited you to join the NovaSafe admin workspace as <b>${roleLabel}</b>.</p>
    <a href="${inviteUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Accept invite</a>
    <p style="margin:16px 0 0;color:#64748b;font-size:13px;">Or copy this link:<br/><span style="word-break:break-all;color:#334155;">${inviteUrl}</span></p>`;

  return sendMail(
    toEmail,
    `You're invited to NovaSafe Admin (${roleLabel})`,
    emailShell('You\'re invited', bodyHtml, 'This invite expires in 7 days.'),
    `${inviterName} invited you to NovaSafe Admin as ${roleLabel}. Accept: ${inviteUrl}\n\nExpires in 7 days.`,
  );
}
