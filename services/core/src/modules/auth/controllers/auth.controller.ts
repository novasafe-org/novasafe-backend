import type { Request, Response } from 'express';
import { getSignInService } from '../services/sign-in.service';
import { getSessionService } from '../services/session.service';
import { getOAuthGoogleService } from '../services/oauth-google.service';
import { getOAuthAppleService } from '../services/oauth-apple.service';

const send = (res: Response, result: { status: number; body: unknown }) => {
  res.status(result.status).json(result.body);
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body || {};
  send(res, await getSignInService().login(req, email, password));
};

export const verifyTwoFactor = async (req: Request, res: Response): Promise<void> => {
  const { email, code } = req.body || {};
  send(res, await getSignInService().verifyTwoFactor(req, email, code));
};

export const validateSession = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  send(
    res,
    await getSessionService().validateSession(
      req,
      req.user.id,
      Boolean(req.oauthOtpPending),
      req.oauthOtpProvider,
    ),
  );
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  send(res, await getSessionService().logout(req, Boolean(req.oauthOtpPending), req.tokenId));
};

export const googleOAuth = async (req: Request, res: Response): Promise<void> => {
  send(res, await getOAuthGoogleService().signIn(req, String(req.body?.idToken || '').trim()));
};

export const googleVerifyOtp = async (req: Request, res: Response): Promise<void> => {
  send(
    res,
    await getOAuthGoogleService().verifyOtp(
      req,
      req.user?.id || '',
      String(req.body?.otp || '').trim(),
      req.oauthOtpProvider || 'google',
    ),
  );
};

export const googleResendOtp = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.email) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }
  send(
    res,
    await getOAuthGoogleService().resendOtp(req, req.user.email, req.oauthOtpProvider || 'google'),
  );
};

export const completeOAuthWelcome = async (req: Request, res: Response): Promise<void> => {
  const result = await getSessionService().completeOAuthWelcome(req.user?.id || '');
  res.status(result.status).json({ ...result.body, source: req.source });
};

export const appleOAuth = async (req: Request, res: Response): Promise<void> => {
  send(
    res,
    await getOAuthAppleService().signIn(
      req,
      String(req.body?.identityToken || '').trim(),
      typeof req.body?.nonce === 'string' ? req.body.nonce.trim() : '',
      typeof req.body?.givenName === 'string' ? req.body.givenName.trim() : undefined,
      typeof req.body?.familyName === 'string' ? req.body.familyName.trim() : undefined,
    ),
  );
};

export const appleVerifyOtp = async (req: Request, res: Response): Promise<void> => {
  send(
    res,
    await getOAuthAppleService().verifyOtp(
      req,
      req.user?.id || '',
      String(req.body?.otp || '').trim(),
      req.oauthOtpProvider || 'google',
    ),
  );
};

export const appleResendOtp = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.email) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }
  send(
    res,
    await getOAuthAppleService().resendOtp(req, req.user.email, req.oauthOtpProvider || 'google'),
  );
};
