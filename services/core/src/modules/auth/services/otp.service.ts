import { authConfig } from '../../../config/auth.config';
import { OtpPurpose } from '../../../database/schemas/auth/auth.enums';
import { getOtpRepository, type OtpPurposeType } from '../repositories/otp.repository';
import { sendSignupOTPEmail } from './email.service';
import { AuthResponseService } from './auth-response.service';

export class OtpService {
  constructor(
    private readonly otpRepo = getOtpRepository(),
  ) {}

  async upsertAndSend(emailRaw: string, purpose: OtpPurposeType): Promise<boolean> {
    const email = emailRaw.toLowerCase().trim();
    const code = AuthResponseService.randomOtp();
    const expiresAt = new Date(Date.now() + authConfig.otp.ttlMs);
    await this.otpRepo.upsert(email, purpose, code, expiresAt, {
      verifyAttempts: 0,
      lastSentAt: new Date(),
    });
    return sendSignupOTPEmail(email, code);
  }

  async checkResendCooldown(email: string, purpose: OtpPurposeType): Promise<number | null> {
    const record = await this.otpRepo.findByEmailPurpose(email, purpose);
    if (!record?.lastSentAt) return null;
    const elapsed = Date.now() - new Date(record.lastSentAt).getTime();
    if (elapsed < authConfig.otp.resendCooldownMs) {
      return Math.max(1, Math.ceil((authConfig.otp.resendCooldownMs - elapsed) / 1000));
    }
    return null;
  }

  async verifyOauthOtp(
    email: string,
    purpose: OtpPurpose.GoogleOauth | OtpPurpose.AppleOauth,
    otp: string,
  ): Promise<
    | { ok: true }
    | { ok: false; status: number; message: string }
  > {
    const otpDoc = await this.otpRepo.findValid(email, purpose);
    if (!otpDoc) {
      return { ok: false, status: 400, message: 'Invalid or expired verification code' };
    }
    const attempts = Number(otpDoc.verifyAttempts ?? 0);
    if (attempts >= authConfig.otp.maxVerifyAttempts) {
      return { ok: false, status: 429, message: 'Too many attempts. Request a new code.' };
    }
    if (String(otpDoc.code) !== otp) {
      await this.otpRepo.incrementAttempts(otpDoc._id);
      return { ok: false, status: 400, message: 'Invalid or expired verification code' };
    }
    await this.otpRepo.deleteByEmailPurpose(email, purpose);
    return { ok: true };
  }
}

let otpService: OtpService | null = null;
export const getOtpService = (): OtpService => {
  if (!otpService) otpService = new OtpService();
  return otpService;
};
