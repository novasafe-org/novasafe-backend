import type { Request } from 'express';
import { Types } from 'mongoose';
import type { OauthOtpProvider } from '../tokens/token.types';
import { getUserRepository } from '../repositories/user.repository';
import { getSessionRepository } from '../repositories/session.repository';

export class SessionService {
  constructor(
    private readonly users = getUserRepository(),
    private readonly sessions = getSessionRepository(),
  ) {}

  async validateSession(
    req: Request,
    userId: string,
    oauthOtpPending: boolean,
    oauthOtpProvider?: OauthOtpProvider,
  ) {
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return { status: 401, body: { success: false, message: 'Invalid session user id' } };
    }
    const user = await this.users.findByIdActive(userId);
    if (!user) {
      return { status: 404, body: { success: false, message: 'User not found' } };
    }
    const userDto = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      picture: user.picture || user.avatar_url,
    };
    if (oauthOtpPending) {
      return {
        status: 200,
        body: {
          success: true,
          source: req.source,
          pendingNovaSafeEmailVerification: true,
          pendingOtpProvider: (oauthOtpProvider || 'google') as OauthOtpProvider,
          user: userDto,
        },
      };
    }
    return {
      status: 200,
      body: { success: true, source: req.source, user: userDto },
    };
  }

  async logout(req: Request, oauthOtpPending: boolean, tokenId?: string) {
    if (!oauthOtpPending && tokenId) {
      await this.sessions.revokeByTokenId(tokenId);
    }
    return {
      status: 200,
      body: { success: true, source: req.source, message: 'Logout successful' },
    };
  }

  async completeOAuthWelcome(userId: string) {
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return { status: 401, body: { success: false, message: 'Authentication required' } };
    }
    await this.users.updateById(userId, {
      $set: { isFirstOAuthSignup: false, updatedAt: new Date() },
    });
    return { status: 200, body: { success: true } };
  }
}

let sessionService: SessionService | null = null;
export const getSessionService = (): SessionService => {
  if (!sessionService) sessionService = new SessionService();
  return sessionService;
};
