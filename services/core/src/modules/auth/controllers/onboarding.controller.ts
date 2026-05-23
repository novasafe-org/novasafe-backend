import type { Request, Response } from 'express';
import { getSignUpService } from '../services/sign-up.service';

const send = (res: Response, result: { status: number; body: unknown }) => {
  res.status(result.status).json(result.body);
};

export const checkEmail = async (req: Request, res: Response): Promise<void> => {
  send(res, await getSignUpService().checkEmail(req, req.body?.email));
};

export const sendOtp = async (req: Request, res: Response): Promise<void> => {
  send(res, await getSignUpService().sendOtp(req, req.body?.email));
};

export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  send(res, await getSignUpService().verifyOtp(req, req.body?.email, req.body?.otp));
};

export const createAccount = async (req: Request, res: Response): Promise<void> => {
  const { email, fullName, password } = req.body || {};
  send(res, await getSignUpService().createAccount(req, email, fullName, password));
};
