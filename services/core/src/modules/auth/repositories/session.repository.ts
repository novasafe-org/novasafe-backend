import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { ModelRegistry } from '../../../database';
import type { ISession } from '../../../database/schemas/sessions';
import { SESSION_MODEL_NAME } from '../../../database/schemas/sessions';

export class SessionRepository {
  constructor(
    private readonly model: Model<ISession> = ModelRegistry.get<ISession>(SESSION_MODEL_NAME),
  ) {}

  async create(data: Partial<ISession>): Promise<void> {
    await this.model.create(data);
  }

  async countActiveByUserId(userId: string): Promise<number> {
    return this.model.countDocuments({
      userId: new Types.ObjectId(userId),
      revoked: { $ne: true },
    });
  }

  async findActiveByTokenId(tokenId: string): Promise<ISession | null> {
    return this.model.findOne({ tokenId, revoked: { $ne: true } }).lean();
  }

  async revokeByTokenId(tokenId: string): Promise<void> {
    await this.model.updateOne(
      { tokenId },
      { $set: { revoked: true, revokedAt: new Date() } },
    );
  }
}

let sessionRepo: SessionRepository | null = null;
export const getSessionRepository = (): SessionRepository => {
  if (!sessionRepo) sessionRepo = new SessionRepository();
  return sessionRepo;
};
