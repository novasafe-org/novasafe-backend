/**
 * Favorites are stored on {@link IVaultItem.isFavorite}.
 * This module documents the convention for repository/query helpers.
 */
export const VAULT_FAVORITE_FIELD = 'isFavorite' as const;

export const favoriteFilter = { isFavorite: true, deleted: { $ne: true } } as const;
