import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { authConfig } from '../../../config/auth.config';
import { OtpPurpose } from '../../../database/schemas/auth/auth.enums';
import { getOtpRepository } from '../repositories/otp.repository';
import { getSessionRepository } from '../repositories/session.repository';
import { getUserRepository } from '../repositories/user.repository';
import { AuthResponseService } from './auth-response.service';
import { sendPasswordResetEmail } from './email.service';

export class PasswordResetService {
  constructor(
    private readonly users = getUserRepository(),
    private readonly otpRepo = getOtpRepository(),
    private readonly sessions = getSessionRepository(),
  ) {}

  async requestReset(req: Request, emailRaw: string) {
    const email = emailRaw?.toLowerCase().trim();
    if (!email) {
      return { status: 400, body: { success: false, message: 'Email is required' } };
    }

    const user = await this.users.findByEmail(email, true);
    if (!user?.passwordHash) {
      return {
        status: 200,
        body: {
          success: true,
          source: req.source,
          message: 'If an account exists for this email, a reset code has been sent.',
        },
      };
    }

    const code = AuthResponseService.randomOtp();
    const expiresAt = new Date(Date.now() + authConfig.otp.ttlMs);
    await this.otpRepo.deleteByEmailPurpose(email, OtpPurpose.PasswordReset);
    await this.otpRepo.upsert(email, OtpPurpose.PasswordReset, code, expiresAt, {
      verifyAttempts: 0,
      lastSentAt: new Date(),
    });

    await sendPasswordResetEmail(email, code);

    return {
      status: 200,
      body: {
        success: true,
        source: req.source,
        message: 'If an account exists for this email, a reset code has been sent.',
      },
    };
  }

  async confirmReset(req: Request, emailRaw: string, otp: string, newPassword: string) {
    const email = emailRaw?.toLowerCase().trim();
    const normalizedOtp = otp?.trim();
    if (!email || !normalizedOtp || !newPassword) {
      return { status: 400, body: { success: false, message: 'Email, OTP and new password are required' } };
    }
    if (newPassword.length < authConfig.password.minLength) {
      return { status: 400, body: { success: false, message: 'Password does not meet requirements' } };
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

    const passwordHash = await bcrypt.hash(newPassword, authConfig.password.bcryptRounds);
    await this.users.updateById(user._id.toString(), {
      $set: { passwordHash, updatedAt: new Date(), has_password: true },
    });
    await this.sessions.revokeAllByUserId(user._id.toString());
    await this.otpRepo.deleteByEmailPurpose(email, OtpPurpose.PasswordReset);

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
