import type { Model } from 'mongoose';
import { ModelRegistry } from '../../../database';
import { OtpPurpose } from '../../../database/schemas/auth/auth.enums';
import type { IOtpCode } from '../../../database/schemas/auth/auth.interface';
import { OTP_CODE_MODEL_NAME } from '../../../database/schemas/auth';

export type OtpPurposeType = `${OtpPurpose}`;

export class OtpRepository {
  constructor(
    private readonly model: Model<IOtpCode> = ModelRegistry.get<IOtpCode>(OTP_CODE_MODEL_NAME),
  ) {}

  async upsert(
    email: string,
    purpose: OtpPurposeType,
    code: string,
    expiresAt: Date,
    extra?: { verifyAttempts?: number; lastSentAt?: Date },
  ): Promise<void> {
    const now = new Date();
    await this.model.updateOne(
      { email, purpose },
      {
        $set: {
          email,
          purpose,
          code,
          expiresAt,
          verifyAttempts: extra?.verifyAttempts ?? 0,
          updatedAt: now,
          lastSentAt: extra?.lastSentAt ?? now,
        },
      },
      { upsert: true },
    );
  }

  async findValid(email: string, purpose: OtpPurposeType, code?: string): Promise<IOtpCode | null> {
    const filter: Record<string, unknown> = {
      email,
      purpose,
      expiresAt: { $gt: new Date() },
    };
    if (code !== undefined) filter.code = code;
    return this.model.findOne(filter).lean();
  }

  async findByEmailPurpose(email: string, purpose: OtpPurposeType): Promise<IOtpCode | null> {
    return this.model.findOne({ email, purpose }).lean();
  }

  async incrementAttempts(id: unknown): Promise<void> {
    await this.model.updateOne({ _id: id }, { $inc: { verifyAttempts: 1 }, $set: { updatedAt: new Date() } });
  }

  async deleteByEmailPurpose(email: string, purpose: OtpPurposeType): Promise<void> {
    await this.model.deleteMany({ email, purpose });
  }
}

let otpRepo: OtpRepository | null = null;
export const getOtpRepository = (): OtpRepository => {
  if (!otpRepo) otpRepo = new OtpRepository();
  return otpRepo;
};
