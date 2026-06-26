import crypto from 'node:crypto';
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
    await this.otpRepo.deleteByEmailPurpose(email, OtpPurpose.SignupProof);
    await this.otpRepo.upsert(email, OtpPurpose.Signup, code, expiresAt, {
      verifyAttempts: 0,
      lastSentAt: new Date(),
    });
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
    if (!emailRaw || !otp?.trim()) {
      return { status: 400, body: { success: false, message: 'Email and OTP are required' } };
    }
    const email = emailRaw.toLowerCase().trim();
    const normalizedOtp = otp.trim();
    const otpDoc = await this.otpRepo.findByEmailPurpose(email, OtpPurpose.Signup);
    if (!otpDoc || new Date(otpDoc.expiresAt).getTime() <= Date.now()) {
      return { status: 400, body: { success: false, message: 'Invalid or expired OTP' } };
    }
    const attempts = Number(otpDoc.verifyAttempts ?? 0);
    if (attempts >= authConfig.otp.maxVerifyAttempts) {
      return { status: 429, body: { success: false, message: 'Too many attempts. Request a new code.' } };
    }
    if (String(otpDoc.code) !== normalizedOtp) {
      await this.otpRepo.incrementAttempts(otpDoc._id);
      return { status: 400, body: { success: false, message: 'Invalid or expired OTP' } };
    }

    await this.otpRepo.deleteByEmailPurpose(email, OtpPurpose.Signup);
    const signupProofToken = crypto.randomBytes(32).toString('hex');
    const proofExpiresAt = new Date(Date.now() + authConfig.otp.signupProofTtlMs);
    await this.otpRepo.upsert(email, OtpPurpose.SignupProof, signupProofToken, proofExpiresAt);

    return {
      status: 200,
      body: {
        success: true,
        source: req.source,
        message: 'OTP verified',
        signupProofToken,
      },
    };
  }

  async createAccount(
    req: Request,
    emailRaw: string,
    fullName: string,
    password: string,
    signupProofToken?: string,
  ) {
    const email = emailRaw?.toLowerCase().trim();
    if (!email || !fullName || !password || password.length < authConfig.password.minLength) {
      return {
        status: 400,
        body: { success: false, message: 'email, fullName and strong password are required' },
      };
    }
    if (!signupProofToken?.trim()) {
      return {
        status: 403,
        body: { success: false, message: 'Email verification required before creating an account' },
      };
    }

    const proof = await this.otpRepo.findValid(email, OtpPurpose.SignupProof, signupProofToken.trim());
    if (!proof) {
      return {
        status: 403,
        body: { success: false, message: 'Invalid or expired email verification. Verify your OTP again.' },
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

    await this.otpRepo.deleteByEmailPurpose(email, OtpPurpose.SignupProof);

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
