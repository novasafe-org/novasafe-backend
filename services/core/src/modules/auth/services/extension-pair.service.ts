import type { Request } from 'express';
import { getUserRepository } from '../repositories/user.repository';
import { getAuthResponseService } from './auth-response.service';

export class ExtensionPairService {
  constructor(
    private readonly users = getUserRepository(),
    private readonly authResponse = getAuthResponseService(),
  ) {}

  async pair(req: Request, userId: string) {
    if (!userId) {
      return { status: 401, body: { success: false, message: 'Authentication required' } };
    }

    const user = await this.users.findByIdActive(userId);
    if (!user) {
      return { status: 404, body: { success: false, message: 'User not found' } };
    }

    const result = await this.authResponse.buildFullSession(req, user);
    if (!result.success) {
      return { status: 403, body: result };
    }

    return {
      status: 200,
      body: {
        ...result,
        paired: true,
        installationId: String(req.body?.installationId || '').trim() || undefined,
      },
    };
  }
}

let extensionPairService: ExtensionPairService | null = null;
export const getExtensionPairService = (): ExtensionPairService => {
  if (!extensionPairService) extensionPairService = new ExtensionPairService();
  return extensionPairService;
};
