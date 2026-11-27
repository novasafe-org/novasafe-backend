import { Request, Response } from 'express';
import { getRequestContext } from '../../../shared/request-context';
import {
  listDeviceSessions,
  listPendingLoginAlerts,
  registerDevicePushToken,
  removeDeviceSession,
  resolveLoginAlert,
  setSingleDeviceLogin,
} from '../services/device-sessions.service';
import { getSubscriptionStateForUser } from '../../subscriptions/services/subscription.service';

const userIdFromReq = (req: Request): string | null => {
  const id = req.user?.id;
  return id ? String(id) : null;
};

export const getDevices = async (req: Request, res: Response): Promise<void> => {
  const userId = userIdFromReq(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const ctx = getRequestContext();
  const data = await listDeviceSessions({
    userId,
    currentTokenId: req.tokenId || null,
    currentDeviceId: ctx?.snapshot.deviceId || (req.headers['x-device-id'] as string) || null,
  });
  res.status(200).json({ success: true, source: req.source, ...data });
};

export const updateSingleDeviceLogin = async (req: Request, res: Response): Promise<void> => {
  const userId = userIdFromReq(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const state = await getSubscriptionStateForUser(userId);
  const isPro = Boolean(state.entitlements?.canUseMultiDevice);
  if (!isPro) {
    res.status(403).json({
      success: false,
      code: 'NOVASAFE_SUBSCRIPTION_REQUIRED',
      message: 'Single-device login is a Pro security feature.',
    });
    return;
  }
  const enabled = Boolean(req.body?.enabled);
  const singleDeviceLoginEnabled = await setSingleDeviceLogin(userId, enabled);
  res.status(200).json({ success: true, singleDeviceLoginEnabled });
};

export const removeDevice = async (req: Request, res: Response): Promise<void> => {
  const userId = userIdFromReq(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const sessionId = String(req.params.id || '').trim();
  if (!sessionId) {
    res.status(400).json({ success: false, message: 'Session id is required' });
    return;
  }
  const result = await removeDeviceSession({
    userId,
    sessionId,
    currentTokenId: req.tokenId || null,
  });
  if (!result.ok) {
    res.status(400).json({ success: false, message: result.message });
    return;
  }
  res.status(200).json({ success: true, message: result.message });
};

export const getDeviceLoginAlerts = async (req: Request, res: Response): Promise<void> => {
  const userId = userIdFromReq(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const alerts = await listPendingLoginAlerts(userId);
  res.status(200).json({
    success: true,
    alerts: (alerts || []).map((a: Record<string, unknown>) => ({
      id: (a._id as { toString(): string })?.toString?.(),
      kind: a.kind,
      deviceName: a.deviceName,
      platform: a.platform,
      locationLabel: a.locationLabel,
      ipAddress: a.ipAddress,
      createdAt: a.createdAt,
    })),
  });
};

export const registerPushToken = async (req: Request, res: Response): Promise<void> => {
  const userId = userIdFromReq(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const ctx = getRequestContext();
  const deviceKey = String(
    req.body?.deviceId ||
      ctx?.snapshot.deviceId ||
      req.headers['x-device-id'] ||
      '',
  ).trim();
  const token = String(req.body?.token || req.body?.pushToken || '').trim();
  const platform = req.body?.platform ? String(req.body.platform) : null;
  const result = await registerDevicePushToken({
    userId,
    deviceKey,
    token,
    platform,
  });
  if (!result.ok) {
    res.status(400).json({ success: false, message: result.message });
    return;
  }
  res.status(200).json({ success: true, message: result.message });
};

export const postDeviceLoginConsent = async (req: Request, res: Response): Promise<void> => {
  const userId = userIdFromReq(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const action = String(req.body?.action || '').toLowerCase();
  if (action !== 'its_me' && action !== 'not_me') {
    res.status(400).json({ success: false, message: 'action must be its_me or not_me' });
    return;
  }
  const alertId = String(req.body?.alertId || req.params.id || '');
  const result = await resolveLoginAlert(userId, alertId, action);
  if (!result.ok) {
    res.status(400).json({ success: false, message: result.message });
    return;
  }
  res.status(200).json({ success: true, message: result.message });
};
