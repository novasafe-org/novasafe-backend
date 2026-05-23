import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { authConfig } from '../../../config/auth.config';
import { OtpPurpose } from '../../../database/schemas/auth/auth.enums';
import { getUserRepository } from '../repositories/user.repository';
import { getOtpRepository } from '../repositories/otp.repository';
import { getOtpService } from './otp.service';
import { AuthResponseService } from './auth-response.service';
import { sendSignupOTPEmail } from './email.service';

export class SignUpService {
  constructor(
    private readonly users = getUserRepository(),
    private readonly otpRepo = getOtpRepository(),
    private readonly otpService = getOtpService(),
  ) {}

  async checkEmail(req: Request, emailRaw: string) {
    if (!emailRaw) {
      return { status: 400, body: { success: false, message: 'Email is required' } };
    }
    const email = emailRaw.toLowerCase().trim();
    const existing = await this.users.findByEmail(email);
    return {
      status: 200,
      body: { success: true, source: req.source, exists: Boolean(existing) },
    };
  }

  async sendOtp(req: Request, emailRaw: string) {
    if (!emailRaw) {
      return { status: 400, body: { success: false, message: 'Email is required' } };
    }
    const email = emailRaw.toLowerCase().trim();
    const code = AuthResponseService.randomOtp();
    const expiresAt = new Date(Date.now() + authConfig.otp.ttlMs);
    await this.otpRepo.upsert(email, OtpPurpose.Signup, code, expiresAt);
    const sent = await sendSignupOTPEmail(email, code);
    if (!sent) {
      return {
        status: 500,
        body: { success: false, message: 'Unable to send OTP email. Check SMTP configuration.' },
      };
    }
    return {
      status: 200,
      body: { success: true, source: req.source, message: 'OTP sent to your email' },
    };
  }

  async verifyOtp(req: Request, emailRaw: string, otp: string) {
    const email = emailRaw.toLowerCase().trim();
    const record = await this.otpRepo.findValid(email, OtpPurpose.Signup, otp.trim());
    if (!record) {
      return { status: 400, body: { success: false, message: 'Invalid or expired OTP' } };
    }
    return {
      status: 200,
      body: { success: true, source: req.source, message: 'OTP verified' },
    };
  }

  async createAccount(req: Request, emailRaw: string, fullName: string, password: string) {
    const email = emailRaw.toLowerCase().trim();
    if (!email || !fullName || password.length < authConfig.password.minLength) {
      return {
        status: 400,
        body: { success: false, message: 'email, fullName and strong password are required' },
      };
    }
    const existing = await this.users.findByEmailAny(email);
    if (existing && existing.deleted !== true) {
      return { status: 409, body: { success: false, message: 'Email already exists' } };
    }

    const passwordHash = await bcrypt.hash(password, authConfig.password.bcryptRounds);
    const now = new Date();
    if (existing && existing.deleted === true) {
      await this.users.restoreDeletedAccount(existing._id.toString(), {
        email,
        name: fullName,
        passwordHash,
        source: 'mobile',
        twoFactorEnabled: false,
        cloudSyncEnabled: false,
        cloudSyncUpdatedAt: now,
        deleted: false,
        deletedAt: null,
        updatedAt: now,
        novasafeEmailVerified: true,
      });
    } else {
      await this.users.create({
        email,
        name: fullName,
        passwordHash,
        source: 'mobile',
        twoFactorEnabled: false,
        cloudSyncEnabled: false,
        cloudSyncUpdatedAt: now,
        deleted: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        novasafeEmailVerified: true,
      });
    }
    return {
      status: 201,
      body: { success: true, source: req.source, message: 'Account created' },
    };
  }
}

let signUpService: SignUpService | null = null;
export const getSignUpService = (): SignUpService => {
  if (!signUpService) signUpService = new SignUpService();
  return signUpService;
};
