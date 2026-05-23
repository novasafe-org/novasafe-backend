import { Request, Response, NextFunction } from 'express';
import { DEFAULT_CLIENT_PROFILE_ID, getClientProfile } from '../playground/client-profiles';
import { environmentRegistry } from '../environments/environment.registry';

export interface PlaygroundRequestContext {
  environmentId: string;
  coreUrl: string;
  clientProfileId: string;
  clientHeaders: Record<string, string>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      playground?: PlaygroundRequestContext;
    }
  }
}

const PLAYGROUND_ENV_HEADER = 'x-playground-environment';
const PLAYGROUND_CLIENT_HEADER = 'x-playground-client-profile';

export const playgroundContextMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const environmentId =
    (req.header(PLAYGROUND_ENV_HEADER) as string | undefined) ||
    (typeof req.query.env === 'string' ? req.query.env : undefined) ||
    'local';

  const clientProfileId =
    req.header(PLAYGROUND_CLIENT_HEADER) ||
    DEFAULT_CLIENT_PROFILE_ID;

  const profile = getClientProfile(clientProfileId) ?? getClientProfile(DEFAULT_CLIENT_PROFILE_ID)!;

  req.playground = {
    environmentId,
    coreUrl: environmentRegistry.resolveCoreUrl(environmentId),
    clientProfileId: profile.id,
    clientHeaders: { ...profile.headers },
  };

  next();
};
