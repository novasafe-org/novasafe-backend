import type { AuthUserDto, VaultOAuthUserRow } from '../types/auth.types';

export const toAuthUser = (user: VaultOAuthUserRow): AuthUserDto => ({
  id: user._id?.toString?.() || user.googleId || '',
  email: user.email,
  name: user.name,
  picture: user.picture || user.avatar_url,
});

export const isNovaSafeEmailVerified = (
  user: { novasafeEmailVerified?: boolean | null } | null | undefined,
): boolean => {
  if (user?.novasafeEmailVerified === true) return true;
  if (user?.novasafeEmailVerified === false) return false;
  return false;
};

export const buildAppleDisplayName = (
  emailLocal: string,
  given?: string,
  family?: string,
): string => {
  const g = String(given || '').trim();
  const f = String(family || '').trim();
  const combined = `${g} ${f}`.trim();
  if (combined) return combined;
  return emailLocal;
};
