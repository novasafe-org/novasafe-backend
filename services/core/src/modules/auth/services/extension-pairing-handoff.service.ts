import crypto from 'node:crypto';
import type { Request } from 'express';
import { OtpPurpose } from '../../../database/schemas/auth/auth.enums';
import { getOtpRepository } from '../repositories/otp.repository';
import { getUserRepository } from '../repositories/user.repository';
import { getAuthResponseService } from './auth-response.service';

const PAIRING_CODE_TTL_MS = 2 * 60 * 1000;

const installKey = (installationId: string) => `ext-pair:${installationId}`;
const stateKey = (state: string) => `ext-pair-state:${state}`;
const metaKey = (pairingCode: string) => `ext-pair-meta:${pairingCode}`;

export class ExtensionPairingHandoffService {
  constructor(
    private readonly users = getUserRepository(),
    private readonly otpRepo = getOtpRepository(),
    private readonly authResponse = getAuthResponseService(),
  ) {}

  async createHandoff(req: Request, userId: string, installationId: string, state: string) {
    const installId = String(installationId || '').trim();
    const pairingState = String(state || '').trim();
    if (!installId || !pairingState) {
      return { status: 400, body: { success: false, message: 'installationId and state are required' } };
    }

    const user = await this.users.findByIdActive(userId);
    if (!user) {
      return { status: 404, body: { success: false, message: 'User not found' } };
    }

    const pairingCode = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

    await this.otpRepo.deleteByEmailPurpose(installKey(installId), OtpPurpose.ExtensionPairing);
    await this.otpRepo.deleteByEmailPurpose(stateKey(pairingState), OtpPurpose.ExtensionPairing);
    await this.otpRepo.deleteByEmailPurpose(metaKey(pairingCode), OtpPurpose.ExtensionPairing);

    await this.otpRepo.upsert(installKey(installId), OtpPurpose.ExtensionPairing, pairingCode, expiresAt);
    await this.otpRepo.upsert(stateKey(pairingState), OtpPurpose.ExtensionPairing, pairingCode, expiresAt);
    await this.otpRepo.upsert(metaKey(pairingCode), OtpPurpose.ExtensionPairing, userId, expiresAt);

    return {
      status: 200,
      body: {
        success: true,
        pairingCode,
        expiresInSeconds: Math.floor(PAIRING_CODE_TTL_MS / 1000),
      },
    };
  }

  async redeemHandoff(req: Request, pairingCode: string, installationId: string, state: string) {
    const code = String(pairingCode || '').trim();
    const installId = String(installationId || '').trim();
    const pairingState = String(state || '').trim();
    if (!code || !installId || !pairingState) {
      return {
        status: 400,
        body: { success: false, message: 'pairingCode, installationId and state are required' },
      };
    }

    const [installRecord, stateRecord, metaRecord] = await Promise.all([
      this.otpRepo.findValid(installKey(installId), OtpPurpose.ExtensionPairing, code),
      this.otpRepo.findValid(stateKey(pairingState), OtpPurpose.ExtensionPairing, code),
      this.otpRepo.findValid(metaKey(code), OtpPurpose.ExtensionPairing),
    ]);

    if (!installRecord || !stateRecord || !metaRecord?.code) {
      return { status: 400, body: { success: false, message: 'Invalid or expired pairing code' } };
    }

    const user = await this.users.findByIdActive(metaRecord.code);
    if (!user) {
      return { status: 400, body: { success: false, message: 'Invalid or expired pairing code' } };
    }

    await Promise.all([
      this.otpRepo.deleteByEmailPurpose(installKey(installId), OtpPurpose.ExtensionPairing),
      this.otpRepo.deleteByEmailPurpose(stateKey(pairingState), OtpPurpose.ExtensionPairing),
      this.otpRepo.deleteByEmailPurpose(metaKey(code), OtpPurpose.ExtensionPairing),
    ]);

    const result = await this.authResponse.buildFullSession(req, user);
    if (!result.success) {
      return { status: 403, body: result };
    }

    return {
      status: 200,
      body: {
        ...result,
        paired: true,
        installationId: installId,
      },
    };
  }
}

let handoffService: ExtensionPairingHandoffService | null = null;
export const getExtensionPairingHandoffService = (): ExtensionPairingHandoffService => {
  if (!handoffService) handoffService = new ExtensionPairingHandoffService();
  return handoffService;
};
