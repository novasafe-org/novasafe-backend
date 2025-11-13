import { Router, Request, Response } from 'express';
import { validateAddMiddleware } from '../middlewares/operations/validateAddMiddleware';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  res.send('Hello World');
});

export default router;