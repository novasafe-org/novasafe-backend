import nodemailer from 'nodemailer';
import logger from '../logger';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

let transporter: nodemailer.Transporter | null = null;

const getConfig = (): EmailConfig => ({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASSWORD || '',
  from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@novasafe.io',
});

const getTransporter = (): nodemailer.Transporter | null => {
  if (transporter) return transporter;
  const cfg = getConfig();
  if (!cfg.user || !cfg.pass) {
    logger.error('SMTP_USER/SMTP_PASSWORD not configured. Email sending disabled.');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
  });
  transporter.verify().then(() => {
    logger.info('SMTP transporter verified successfully');
  }).catch((err) => {
    logger.warn({ error: err?.message }, 'SMTP transporter verification failed');
  });
  return transporter;
};

const sendMail = async (to: string, subject: string, html: string, text: string): Promise<boolean> => {
  const mailer = getTransporter();
  if (!mailer) return false;
  try {
    const cfg = getConfig();
    const info = await mailer.sendMail({
      from: `"NovaSafe" <${cfg.from}>`,
      to,
      subject,
      html,
      text,
    });
    logger.info({ to, messageId: info.messageId }, 'Email sent');
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
