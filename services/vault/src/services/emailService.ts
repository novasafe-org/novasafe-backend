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
let transporterVerified = false;

const getTransporter = (): nodemailer.Transporter | null => {
  if (transporter) {
    // Verify connection asynchronously if not already verified (non-blocking)
    if (!transporterVerified) {
      transporter.verify().then(() => {
        logger.info('Email transporter connection verified successfully');
        transporterVerified = true;
      }).catch((verifyError: any) => {
        logger.warn({ error: verifyError.message }, 'Email transporter verification failed, but transporter created. Emails may still work.');
      });
    }
    return transporter;
  }

  const config = getEmailConfig();

  // Log SMTP configuration status (without exposing passwords)
  logger.info({
    smtpHost: config.host,
    smtpPort: config.port,
    smtpSecure: config.secure,
    smtpUser: config.auth.user ? '***configured***' : 'NOT SET',
    smtpPassword: config.auth.pass ? '***configured***' : 'NOT SET',
    smtpFrom: config.from,
  }, 'SMTP Configuration Status');

  // If SMTP is not configured, return null (emails won't be sent)
  if (!config.auth.user || !config.auth.pass) {
    logger.error({
      envSMTP_HOST: process.env.SMTP_HOST || 'NOT SET',
      envSMTP_PORT: process.env.SMTP_PORT || 'NOT SET',
      envSMTP_USER: process.env.SMTP_USER ? '***configured***' : 'NOT SET',
      envSMTP_PASSWORD: process.env.SMTP_PASSWORD ? '***configured***' : 'NOT SET',
      envSMTP_FROM: process.env.SMTP_FROM || 'NOT SET',
    }, 'SMTP not configured. Email sending is disabled. Check .env file and environment variables.');
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      // Add TLS options for better compatibility
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates (for development)
      },
      // Add connection timeout and retry options for Mac network issues
      connectionTimeout: 30000, // 30 seconds connection timeout (increased for Mac network issues)
      greetingTimeout: 30000, // 30 seconds greeting timeout
      socketTimeout: 30000, // 30 seconds socket timeout
      // Enable debug for troubleshooting (set to 2 for verbose)
      debug: process.env.NODE_ENV === 'development' ? false : false,
      logger: process.env.NODE_ENV === 'development',
    });

    logger.info({ 
      host: config.host, 
      port: config.port, 
      secure: config.secure,
      connectionTimeout: 10000,
    }, 'Email transporter created with timeout settings');
    
    // Verify connection asynchronously (non-blocking)
    transporter.verify().then(() => {
      logger.info('Email transporter connection verified successfully');
      transporterVerified = true;
    }).catch((verifyError: any) => {
      logger.warn({ error: verifyError.message }, 'Email transporter verification failed, but transporter created. Emails may still work.');
    });
    
    return transporter;
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'Failed to create email transporter');
    return null;
  }
};

/**
 * Send invitation email with retry logic for network issues
 */
export const sendInvitationEmail = async (
  email: string,
  invitationToken: string,
  organizationName: string,
  role: string,
  invitedBy: string,
  expiresAt: Date
): Promise<boolean> => {
  const maxRetries = 3;
  let lastError: any = null;

  // Check transporter first (before retry loop)
  const emailTransporter = getTransporter();
  if (!emailTransporter) {
    const smtpConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
    if (!smtpConfigured) {
      logger.error({ email }, 'SMTP not configured. Cannot send invitation email. Please configure SMTP_HOST, SMTP_USER, and SMTP_PASSWORD environment variables.');
    } else {
      logger.error({ email }, 'Email transporter creation failed. Check SMTP configuration.');
    }
    return false;
  }

  const config = getEmailConfig();
  // Invitation acceptance is part of auth/onboarding flow: use auth app URL (start.novasafe.io in prod, localhost:3061 in dev)
  const authAppUrl = (process.env.AUTH_APP_URL || process.env.START_URL || 'http://localhost:3061').replace(/\/$/, '');
  const acceptUrl = `${authAppUrl}/accept-invitation?token=${invitationToken}`;
  const expiresInDays = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  // Print invite URL to terminal for testing when email is blocked (e.g. VPN)
  console.log('\n========== INVITATION ACCEPT URL (use for testing if email is not delivered) ==========');
  console.log(acceptUrl);
  console.log('========================================================================================\n');
  logger.info({ acceptUrl, email }, 'Invitation accept URL logged above for testing');

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

  // Retry loop for network timeout errors
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info({ 
        email,
        to: mailOptions.to,
        subject: mailOptions.subject,
        from: mailOptions.from,
        host: config.host,
        port: config.port,
        secure: config.secure,
        attempt: `${attempt}/${maxRetries}`,
      }, 'Attempting to send invitation email...');
      
      const info = await emailTransporter.sendMail(mailOptions);
      logger.info({ 
        email, 
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
        responseCode: info.responseCode,
        attempt: attempt,
      }, 'Invitation email sent successfully');
      return true;
    } catch (error: any) {
      lastError = error;
      const isTimeoutError = error.code === 'ETIMEDOUT' || error.code === 'ESOCKET' || error.errno === -60;
      const isRetryable = isTimeoutError && attempt < maxRetries;
      
      logger.warn({ 
        error: error.message, 
        email,
        code: error.code,
        errno: error.errno,
        attempt: `${attempt}/${maxRetries}`,
        willRetry: isRetryable,
      }, `Failed to send invitation email (attempt ${attempt}/${maxRetries})`);
      
      if (isRetryable) {
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 1s, 2s, 4s max
        logger.info({ delay, nextAttempt: attempt + 1 }, 'Retrying email send after delay...');
        await new Promise(resolve => setTimeout(resolve, delay));
        continue; // Retry
      } else {
        // Not retryable or max retries reached
        break;
      }
    }
  }
  
  // All retries failed
  logger.error({ 
    error: lastError?.message, 
    email,
    code: lastError?.code,
    command: lastError?.command,
    response: lastError?.response,
    responseCode: lastError?.responseCode,
    errno: lastError?.errno,
    syscall: lastError?.syscall,
    hostname: lastError?.hostname,
    port: lastError?.port,
    stack: lastError?.stack,
    attempts: maxRetries,
  }, 'Failed to send invitation email after all retries - Detailed error information');
  
  // Provide helpful error message for common Mac network issues
  if (lastError?.code === 'ETIMEDOUT' || lastError?.errno === -60) {
    logger.error({
      suggestion: 'Network connectivity issue detected. Check:',
      checks: [
        '1. Firewall settings - ensure port 587 is not blocked',
        '2. Network connection - verify internet connectivity',
        '3. VPN/Proxy - may be blocking SMTP connections',
        '4. Try alternative port 465 with SMTP_SECURE=true',
        '5. Check if ISP blocks port 587',
      ],
    }, 'Network connectivity troubleshooting suggestions');
  }
  
  return false;
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
/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (
  email: string,
  resetUrl: string
): Promise<boolean> => {
  const maxRetries = 3;
  let lastError: any = null;

  // Check transporter first
  const emailTransporter = getTransporter();
  if (!emailTransporter) {
    const smtpConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
    if (!smtpConfigured) {
      logger.error({ email }, 'SMTP not configured. Cannot send password reset email.');
    } else {
      logger.error({ email }, 'Email transporter creation failed. Check SMTP configuration.');
    }
    return false;
  }

  const config = getEmailConfig();

  const mailOptions = {
    from: `"NovaSafe" <${config.from}>`,
    to: email,
    subject: 'Reset Your NovaSafe Password',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password - NovaSafe</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0; font-size: 28px;">NovaSafe</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">Your Family's Digital Safe</p>
          </div>
          
          <h2 style="color: #1a1a1a; margin-top: 0;">Reset Your Password</h2>
          
          <p style="color: #555; margin-bottom: 20px;">
            You requested to reset your password. Click the button below to create a new password.
          </p>
          
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: 600;">
              ⚠️ Important: Resetting your password will permanently delete all your encrypted vault data.
            </p>
            <p style="margin: 10px 0 0 0; color: #92400e; font-size: 13px;">
              NovaSafe cannot recover this data. If you have a recovery key, use it instead.
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600; font-size: 16px;">
              Reset Password
            </a>
          </div>
          
          <p style="color: #888; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
          </p>
          
          <p style="color: #888; font-size: 12px; margin-top: 20px;">
            This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
          <p>© ${new Date().getFullYear()} NovaSafe. All rights reserved.</p>
        </div>
      </body>
      </html>
    `,
    text: `
Reset Your NovaSafe Password

You requested to reset your password. Click the link below to create a new password.

⚠️ Important: Resetting your password will permanently delete all your encrypted vault data.
NovaSafe cannot recover this data. If you have a recovery key, use it instead.

Reset Password: ${resetUrl}

This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
    `.trim(),
  };

  // Retry loop for network timeout errors
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info({ 
        email,
        attempt: `${attempt}/${maxRetries}`,
      }, 'Attempting to send password reset email...');
      
      const info = await emailTransporter.sendMail(mailOptions);
      logger.info({ 
        email, 
        messageId: info.messageId,
        attempt: attempt,
      }, 'Password reset email sent successfully');
      return true;
    } catch (error: any) {
      lastError = error;
      logger.warn({ 
        error: error.message, 
        code: error.code,
        attempt: `${attempt}/${maxRetries}`,
        email,
      }, 'Failed to send password reset email, retrying...');
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  logger.error({ 
    error: lastError?.message, 
    code: lastError?.code,
    email,
  }, 'Failed to send password reset email after all retries');
  return false;
};

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

