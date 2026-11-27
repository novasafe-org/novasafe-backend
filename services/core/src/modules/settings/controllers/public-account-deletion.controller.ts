import { randomBytes } from 'node:crypto';
import { Request, Response } from 'express';
import { ObjectId } from '../../../database/object-id';
import { OtpPurpose } from '../../../database/schemas/auth/auth.enums';
import { getOtpRepository } from '../../auth/repositories/otp.repository';
import { sendAccountDeletionConfirmEmail } from '../../auth/services/email.service';
import {
  findActiveUserByEmail,
  performAccountDeletion,
} from '../services/account-deletion.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const landingBaseUrl = (): string =>
  (process.env.LANDING_URL || process.env.VITE_LANDING_URL || 'https://novasafe.io').replace(
    /\/$/,
    '',
  );

const genericAccepted = (res: Response) =>
  res.status(200).json({
    success: true,
    message:
      'If an account exists for that email, we sent a confirmation link. Deletion is confirmed after you open it.',
  });

/**
 * Public web flow (landing /account/deletion).
 * Body: { email: string }
 * Always returns the same success shape (no email enumeration).
 * Queues a confirmation token and emails a confirm link; does not delete yet.
 */
export const requestAccountDeletionByEmail = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const email = String(req.body?.email || '')
    .toLowerCase()
    .trim();
  if (!email || !EMAIL_RE.test(email)) {
    res.status(400).json({ success: false, message: 'A valid email is required' });
    return;
  }

  const user = await findActiveUserByEmail(email);
  if (!user?._id) {
    // Same response whether or not the account exists.
    genericAccepted(res);
    return;
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const otp = getOtpRepository();
  await otp.upsert(email, OtpPurpose.AccountDeletion, token, expiresAt);

  const confirmUrl =
    `${landingBaseUrl()}/account/deletion/confirm` +
    `?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

  await sendAccountDeletionConfirmEmail(email, confirmUrl);
  genericAccepted(res);
};

/**
 * Confirm deletion from the emailed link.
 * Body: { email: string, token: string }
 * Runs the same soft-delete as POST /mobile/settings/delete-account.
 */
export const confirmAccountDeletionByEmail = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const email = String(req.body?.email || '')
    .toLowerCase()
    .trim();
  const token = String(req.body?.token || '').trim();

  if (!email || !EMAIL_RE.test(email) || !token) {
    res.status(400).json({ success: false, message: 'Email and token are required' });
    return;
  }

  const otp = getOtpRepository();
  const doc = await otp.findValid(email, OtpPurpose.AccountDeletion, token);
  if (!doc) {
    res.status(400).json({
      success: false,
      message: 'This confirmation link is invalid or expired. Request deletion again.',
    });
    return;
  }

  const user = await findActiveUserByEmail(email);
  if (!user?._id) {
    await otp.deleteByEmailPurpose(email, OtpPurpose.AccountDeletion);
    res.status(200).json({
      success: true,
      message: 'Account already deleted or not found.',
    });
    return;
  }

  const userObjectId =
    user._id instanceof ObjectId ? user._id : new ObjectId(String(user._id));

  await performAccountDeletion(userObjectId, 'web_email');
  await otp.deleteByEmailPurpose(email, OtpPurpose.AccountDeletion);

  res.status(200).json({
    success: true,
    message: 'Account deleted successfully',
  });
};
