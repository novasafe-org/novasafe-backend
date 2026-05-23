import type { IReplayCache } from '../interfaces';

/**
 * Redis-backed replay cache placeholder.
 * Wire when TRUST_REDIS_URL is configured in production.
 */
export class RedisReplayCache implements IReplayCache {
  constructor(private readonly _redisUrl: string) {}

  async hasNonce(_clientId: string, _nonce: string): Promise<boolean> {
    throw new Error('RedisReplayCache is not wired yet. Use InMemoryReplayCache or set TRUST_REDIS_URL integration.');
  }

  async storeNonce(_clientId: string, _nonce: string, _ttlMs: number): Promise<void> {
    throw new Error('RedisReplayCache is not wired yet.');
  }
}
