import { Request, Response } from 'express';
import { getDashboardStats } from '../services/mobileVaultService';
import { toMobileItemSummary } from '../utils/mobileItemFormatter';

export const getMobileDashboard = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id) {
    return void res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const stats = await getDashboardStats(req.user.id);
  res.status(200).json({
    success: true,
    source: req.source,
    data: {
      totalItems: stats.totalItems,
      weakPasswordsCount: stats.weakPasswordsCount,
      reusedPasswordsCount: stats.reusedPasswordsCount,
      breachedPasswordsCount: stats.breachedPasswordsCount,
      recentlyUsed: stats.recentlyUsed.map(toMobileItemSummary),
    },
  });
};

export const getMobileSecuritySummary = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id) {
    return void res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const stats = await getDashboardStats(req.user.id);
  res.status(200).json({
    success: true,
    source: req.source,
    data: {
      score: stats.securityScore,
      weak: stats.weakPasswordsCount,
      reused: stats.reusedPasswordsCount,
      breached: stats.breachedPasswordsCount,
      total: stats.totalItems,
    },
  });
};
