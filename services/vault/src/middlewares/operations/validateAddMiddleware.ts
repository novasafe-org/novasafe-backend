import { Request, Response, NextFunction } from 'express';

export const validateAddMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const { a, b } = req.body;
  if (typeof a === 'number' && typeof b === 'number') {
    next();
  } else {
    res.status(400).json({ error: 'Invalid input. Please provide two numbers.' });
  }
};