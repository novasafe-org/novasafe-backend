import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { authConfig } from '../../../config/auth.config';
import { OtpPurpose } from '../../../database/schemas/auth/auth.enums';
import { getOtpRepository } from '../repositories/otp.repository';
import { getSessionRepository } from '../repositories/session.repository';
import { getUserRepository } from '../repositories/user.repository';
import { AuthResponseService } from './auth-response.service';
import { sendPasswordResetEmail } from './email.service';
import { getOtpService } from './otp.service';

export class PasswordResetService {
  constructor(
    private readonly users = getUserRepository(),
    private readonly otpRepo = getOtpRepository(),
    private readonly sessions = getSessionRepository(),
    private readonly otpService = getOtpService(),
  ) {}

  async requestReset(req: Request, emailRaw: string) {
    const email = emailRaw?.toLowerCase().trim();
    if (!email) {
      return { status: 400, body: { success: false, message: 'Email is required' } };
    }

    const user = await this.users.findByEmail(email, true);
    if (!user?.passwordHash) {
      // Same response as a real send (no account enumeration). No email is sent and
      // no OTP is stored, so verify/confirm cannot succeed for unknown addresses.
      await new Promise((resolve) => setTimeout(resolve, 400 + Math.floor(Math.random() * 200)));
      return {
        status: 200,
        body: {
          success: true,
          source: req.source,
          message: 'If an account exists for this email, a reset code has been sent.',
        },
      };
    }

    const waitSec = await this.otpService.checkResendCooldown(email, OtpPurpose.PasswordReset);
    if (waitSec) {
      return {
        status: 429,
        body: {
          success: false,
          message: `Please wait ${waitSec}s before requesting another code.`,
          retryAfterSeconds: waitSec,
        },
      };
    }

    const code = AuthResponseService.randomOtp();
    const expiresAt = new Date(Date.now() + authConfig.otp.ttlMs);
    await this.otpRepo.deleteByEmailPurpose(email, OtpPurpose.PasswordResetProof);
    await this.otpRepo.upsert(email, OtpPurpose.PasswordReset, code, expiresAt, {
      verifyAttempts: 0,
      lastSentAt: new Date(),
    });

    const sent = await sendPasswordResetEmail(email, code);
    if (!sent) {
      return {
        status: 500,
        body: { success: false, message: 'Unable to send reset email. Try again shortly.' },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        source: req.source,
        message: 'If an account exists for this email, a reset code has been sent.',
      },
    };
  }

  async verifyOtp(req: Request, emailRaw: string, otp: string) {
    const email = emailRaw?.toLowerCase().trim();
    const normalizedOtp = otp?.trim();
    if (!email || !normalizedOtp) {
      return { status: 400, body: { success: false, message: 'Email and code are required' } };
    }

    const otpDoc = await this.otpRepo.findByEmailPurpose(email, OtpPurpose.PasswordReset);
    if (!otpDoc || new Date(otpDoc.expiresAt).getTime() <= Date.now()) {
      return { status: 400, body: { success: false, message: 'Invalid or expired reset code' } };
    }

    const attempts = Number(otpDoc.verifyAttempts ?? 0);
    if (attempts >= authConfig.otp.maxVerifyAttempts) {
      return { status: 429, body: { success: false, message: 'Too many attempts. Request a new code.' } };
    }
    if (String(otpDoc.code) !== normalizedOtp) {
      await this.otpRepo.incrementAttempts(otpDoc._id);
      return { status: 400, body: { success: false, message: 'Invalid or expired reset code' } };
    }

    const user = await this.users.findByEmail(email, true);
    if (!user?.passwordHash) {
      return { status: 400, body: { success: false, message: 'Invalid or expired reset code' } };
    }

    await this.otpRepo.deleteByEmailPurpose(email, OtpPurpose.PasswordReset);
    const resetProofToken = crypto.randomBytes(32).toString('hex');
    const proofExpiresAt = new Date(Date.now() + authConfig.otp.signupProofTtlMs);
    await this.otpRepo.upsert(email, OtpPurpose.PasswordResetProof, resetProofToken, proofExpiresAt);

    return {
      status: 200,
      body: {
        success: true,
        source: req.source,
        message: 'Code verified',
        resetProofToken,
      },
    };
  }

  async confirmReset(
    req: Request,
    emailRaw: string,
    newPassword: string,
    otp?: string,
    resetProofToken?: string,
  ) {
    const email = emailRaw?.toLowerCase().trim();
    if (!email || !newPassword) {
      return { status: 400, body: { success: false, message: 'Email and new password are required' } };
    }
    if (newPassword.length < authConfig.password.minLength) {
      return { status: 400, body: { success: false, message: 'Password must be at least 8 characters' } };
    }

    const proofToken = resetProofToken?.trim();
    const normalizedOtp = otp?.trim();

    if (proofToken) {
      const proof = await this.otpRepo.findValid(email, OtpPurpose.PasswordResetProof, proofToken);
      if (!proof) {
        return {
          status: 403,
          body: { success: false, message: 'Reset session expired. Request a new code.' },
        };
      }
    } else if (normalizedOtp) {
      const otpDoc = await this.otpRepo.findByEmailPurpose(email, OtpPurpose.PasswordReset);
      if (!otpDoc || new Date(otpDoc.expiresAt).getTime() <= Date.now()) {
        return { status: 400, body: { success: false, message: 'Invalid or expired reset code' } };
      }

      const attempts = Number(otpDoc.verifyAttempts ?? 0);
      if (attempts >= authConfig.otp.maxVerifyAttempts) {
        return { status: 429, body: { success: false, message: 'Too many attempts. Request a new code.' } };
      }
      if (String(otpDoc.code) !== normalizedOtp) {
        await this.otpRepo.incrementAttempts(otpDoc._id);
        return { status: 400, body: { success: false, message: 'Invalid or expired reset code' } };
      }
    } else {
      return { status: 400, body: { success: false, message: 'Verification required before resetting password' } };
    }

    const user = await this.users.findByEmail(email, true);
    if (!user?.passwordHash) {
      return { status: 400, body: { success: false, message: 'Unable to reset password for this email' } };
    }

    const passwordHash = await bcrypt.hash(newPassword, authConfig.password.bcryptRounds);
    await this.users.updateById(user._id.toString(), {
      $set: { passwordHash, updatedAt: new Date(), has_password: true },
    });
    await this.sessions.revokeAllByUserId(user._id.toString());
    await this.otpRepo.deleteByEmailPurpose(email, OtpPurpose.PasswordReset);
    await this.otpRepo.deleteByEmailPurpose(email, OtpPurpose.PasswordResetProof);

    return {
      status: 200,
      body: {
        success: true,
        source: req.source,
        message: 'Password updated. Sign in with your new password.',
      },
    };
  }
}

let passwordResetService: PasswordResetService | null = null;
export const getPasswordResetService = (): PasswordResetService => {
  if (!passwordResetService) passwordResetService = new PasswordResetService();
  return passwordResetService;
};
