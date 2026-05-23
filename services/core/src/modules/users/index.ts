import { Express, Router } from 'express';

export const USERS_MODULE_NAME = 'users';

const createModuleRouter = (): Router => {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(200).json({
      success: true,
      module: USERS_MODULE_NAME,
      status: 'placeholder',
    });
  });

  return router;
};

export const registerUsersModule = (app: Express, apiPrefix: string): void => {
  app.use(`${apiPrefix}/${USERS_MODULE_NAME}`, createModuleRouter());
};
