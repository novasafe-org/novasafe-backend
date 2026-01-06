/**
 * Email Service
 * 
 * Handles sending emails using SMTP (nodemailer)
 * Supports invitation emails, OTP emails, and other notifications
 */

import nodemailer from 'nodemailer';
import logger from '../logger';

/**
 * Email configuration from environment variables
 */
interface EmailConfig {
  host: string;
  port: number;
  secure: boolean; // true for 465, false for other ports
  auth: {
    user: string;
    pass: string;
  };
  from: string; // Default from address
}

/**
 * Get email configuration from environment
 */
const getEmailConfig = (): EmailConfig => {
  return {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASSWORD || '',
    },
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@novasafe.com',
  };
};

/**
 * Create email transporter
 */
let transporter: nodemailer.Transporter | null = null;

const getTransporter = (): nodemailer.Transporter | null => {
  if (transporter) {
    return transporter;
  }

  const config = getEmailConfig();

  // If SMTP is not configured, return null (emails won't be sent)
  if (!config.auth.user || !config.auth.pass) {
    logger.warn('SMTP not configured. Email sending is disabled.');
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });

    logger.info({ host: config.host, port: config.port }, 'Email transporter created');
    return transporter;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to create email transporter');
    return null;
  }
};

/**
 * Send invitation email
 */
export const sendInvitationEmail = async (
  email: string,
  invitationToken: string,
  organizationName: string,
  role: string,
  invitedBy: string,
  expiresAt: Date
): Promise<boolean> => {
  try {
    const emailTransporter = getTransporter();
    if (!emailTransporter) {
      logger.warn({ email }, 'Email transporter not available. Skipping email send.');
      return false;
    }

    const config = getEmailConfig();
    const acceptUrl = `${process.env.FRONTEND_URL || 'http://localhost:8080'}/accept-invitation?token=${invitationToken}`;
    const expiresInDays = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    const mailOptions = {
      from: `"NovaSafe" <${config.from}>`,
      to: email,
      subject: `You've been invited to join ${organizationName} on NovaSafe`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invitation to NovaSafe</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
          <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #2563eb; margin: 0; font-size: 28px;">NovaSafe</h1>
              <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">Your Family's Digital Safe</p>
            </div>
            
            <h2 style="color: #1a1a1a; margin-top: 0;">You've been invited!</h2>
            
            <p style="color: #555; margin-bottom: 20px;">
              <strong>${invitedBy}</strong> has invited you to join <strong>${organizationName}</strong> on NovaSafe as a <strong>${role}</strong>.
            </p>
            
            <div style="background-color: #f8f9fa; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 0; color: #555; font-size: 14px;">
                <strong>Role:</strong> ${role.charAt(0).toUpperCase() + role.slice(1)}<br>
                <strong>Organization:</strong> ${organizationName}<br>
                <strong>Expires in:</strong> ${expiresInDays} ${expiresInDays === 1 ? 'day' : 'days'}
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${acceptUrl}" 
                 style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Accept Invitation
              </a>
            </div>
            
            <p style="color: #888; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${acceptUrl}" style="color: #2563eb; word-break: break-all;">${acceptUrl}</a>
            </p>
            
            <p style="color: #888; font-size: 12px; margin-top: 20px;">
              This invitation will expire in ${expiresInDays} ${expiresInDays === 1 ? 'day' : 'days'}. If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>© ${new Date().getFullYear()} NovaSafe. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `
You've been invited to join ${organizationName} on NovaSafe!

${invitedBy} has invited you to join ${organizationName} as a ${role}.

Accept your invitation: ${acceptUrl}

This invitation expires in ${expiresInDays} ${expiresInDays === 1 ? 'day' : 'days'}.

If you didn't expect this invitation, you can safely ignore this email.
      `.trim(),
    };

    const info = await emailTransporter.sendMail(mailOptions);
    logger.info({ email, messageId: info.messageId }, 'Invitation email sent successfully');
    return true;
  } catch (error: any) {
    logger.error({ error: error.message, email }, 'Failed to send invitation email');
    return false;
  }
};

/**
 * Send OTP email
 */
export const sendOTPEmail = async (email: string, otp: string): Promise<boolean> => {
  try {
    const emailTransporter = getTransporter();
    if (!emailTransporter) {
      logger.warn({ email }, 'Email transporter not available. Skipping OTP email send.');
      return false;
    }

    const config = getEmailConfig();

    const mailOptions = {
      from: `"NovaSafe" <${config.from}>`,
      to: email,
      subject: 'Your NovaSafe Verification Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verification Code - NovaSafe</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
          <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #2563eb; margin: 0; font-size: 28px;">NovaSafe</h1>
              <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">Your Family's Digital Safe</p>
            </div>
            
            <h2 style="color: #1a1a1a; margin-top: 0;">Email Verification</h2>
            
            <p style="color: #555; margin-bottom: 20px;">
              Please use the following verification code to complete your account setup:
            </p>
            
            <div style="background-color: #f8f9fa; border: 2px dashed #2563eb; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center;">
              <p style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2563eb; font-family: 'Courier New', monospace;">
                ${otp}
              </p>
            </div>
            
            <p style="color: #888; font-size: 12px; margin-top: 20px;">
              This code will expire in 10 minutes. If you didn't request this code, you can safely ignore this email.
            </p>
            
            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 0; color: #856404; font-size: 12px;">
                <strong>Security Tip:</strong> Never share this code with anyone. NovaSafe will never ask for your verification code.
              </p>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>© ${new Date().getFullYear()} NovaSafe. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `
NovaSafe Email Verification

Your verification code is: ${otp}

This code will expire in 10 minutes.

If you didn't request this code, you can safely ignore this email.

© ${new Date().getFullYear()} NovaSafe. All rights reserved.
      `.trim(),
    };

    const info = await emailTransporter.sendMail(mailOptions);
    logger.info({ email, messageId: info.messageId }, 'OTP email sent successfully');
    return true;
  } catch (error: any) {
    logger.error({ error: error.message, email }, 'Failed to send OTP email');
    return false;
  }
};

/**
 * Verify email transporter connection
 */
export const verifyEmailConnection = async (): Promise<boolean> => {
  try {
    const emailTransporter = getTransporter();
    if (!emailTransporter) {
      return false;
    }

    await emailTransporter.verify();
    logger.info('Email transporter connection verified');
    return true;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Email transporter connection verification failed');
    return false;
  }
};

