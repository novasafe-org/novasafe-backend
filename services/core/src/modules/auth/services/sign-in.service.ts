import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { authConfig } from '../../../config/auth.config';
import { logger } from '../../../shared/logger';
import { getUserRepository } from '../repositories/user.repository';
import { getTwoFactorRepository } from '../repositories/two-factor.repository';
import { getAuthResponseService } from './auth-response.service';
import { sendTwoFactorEmail } from './email.service';
import { AuthResponseService } from './auth-response.service';

export class SignInService {
  constructor(
    private readonly users = getUserRepository(),
    private readonly twoFactor = getTwoFactorRepository(),
    private readonly authResponse = getAuthResponseService(),
  ) {}

  async login(req: Request, emailRaw: string, password: string) {
    if (!emailRaw || !password) {
      return { status: 400, body: { success: false, message: 'Email and password are required' } };
    }
    const email = emailRaw.toLowerCase().trim();
    const user = await this.users.findByEmail(email, true);
    if (!user?.passwordHash) {
      return { status: 401, body: { success: false, message: 'Invalid email or password' } };
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return { status: 401, body: { success: false, message: 'Invalid email or password' } };
    }

    if (user.twoFactorEnabled) {
      const code = AuthResponseService.randomOtp();
      await this.twoFactor.createChallenge({
        userId: new Types.ObjectId(user._id.toString()),
        email: user.email,
        code,
        expiresAt: new Date(Date.now() + authConfig.otp.ttlMs),
        source: 'mobile',
      });
      const sent = await sendTwoFactorEmail(user.email, code);
      if (!sent) {
        return {
          status: 500,
          body: { success: false, message: 'Unable to send 2FA code email. Check SMTP configuration.' },
        };
      }
      logger.info('2FA challenge issued', { email });
      return {
        status: 200,
        body: {
          success: true,
          source: req.source,
          requiresTwoFactor: true,
          message: 'Two-factor verification required',
          user: {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            picture: user.picture,
          },
        },
      };
    }

    const authResponse = await this.authResponse.buildFullSession(req, user);
    return { status: 200, body: authResponse };
  }

  async verifyTwoFactor(req: Request, emailRaw: string, code: string) {
    if (!emailRaw || !code) {
      return { status: 400, body: { success: false, message: 'Email and code are required' } };
    }
    const email = emailRaw.toLowerCase().trim();
    const user = await this.users.findByEmail(email, true);
    if (!user) {
      return { status: 404, body: { success: false, message: 'User not found' } };
    }
    const challenge = await this.twoFactor.findValidChallenge(
      new Types.ObjectId(user._id.toString()),
      code.trim(),
    );
    if (!challenge) {
      return { status: 400, body: { success: false, message: 'Invalid or expired verification code' } };
    }
    await this.twoFactor.markVerified(challenge._id);
    const authResponse = await this.authResponse.buildFullSession(req, user);
    return { status: 200, body: authResponse };
  }
}

let signInService: SignInService | null = null;
export const getSignInService = (): SignInService => {
  if (!signInService) signInService = new SignInService();
  return signInService;
};
