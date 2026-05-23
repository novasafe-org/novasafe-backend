import type { IReplayCache } from '../interfaces';

interface CacheEntry {
  expiresAt: number;
}

/**
 * Process-local replay cache (development / single-instance).
 * Replace with Redis implementation via `IReplayCache` for production.
 */
export class InMemoryReplayCache implements IReplayCache {
  private readonly store = new Map<string, CacheEntry>();

  async hasNonce(clientId: string, nonce: string): Promise<boolean> {
    this.prune();
    const key = `${clientId}:${nonce}`;
    return this.store.has(key);
  }

  async storeNonce(clientId: string, nonce: string, ttlMs: number): Promise<void> {
    this.prune();
    const key = `${clientId}:${nonce}`;
    this.store.set(key, { expiresAt: Date.now() + ttlMs });
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
  }
}

let cacheInstance: InMemoryReplayCache | null = null;
export const getReplayCache = (): IReplayCache => {
  if (!cacheInstance) cacheInstance = new InMemoryReplayCache();
  return cacheInstance;
};
