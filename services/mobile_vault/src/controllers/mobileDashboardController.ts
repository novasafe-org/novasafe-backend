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
      recentlyUsed: stats.recentlyUsed.map(toMobileItemSummary),
    },
  });
};
