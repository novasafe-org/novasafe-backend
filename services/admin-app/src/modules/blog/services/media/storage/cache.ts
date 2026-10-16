import type { MediaStorageProvider, StoredFile } from "./types";

type CacheEntry = {
  file: StoredFile;
  expiresAt: number;
};

/**
 * In-process read cache for slow backends (e.g. Google Drive).
 * Safe on Lambda: bounded size; survives warm invocations only.
 */
export class CachingMediaStorageProvider implements MediaStorageProvider {
  readonly providerId: string;

  constructor(
    private readonly inner: MediaStorageProvider,
    private readonly options: { ttlMs: number; maxEntries: number; maxBytes: number },
  ) {
    this.providerId = `${inner.providerId}+cache`;
  }

  private cache = new Map<string, CacheEntry>();
  private cacheBytes = 0;

  async put(input: Parameters<MediaStorageProvider["put"]>[0]) {
    return this.inner.put(input);
  }

  async get(storageKey: string): Promise<StoredFile | null> {
    const now = Date.now();
    const hit = this.cache.get(storageKey);
    if (hit && hit.expiresAt > now) {
      return hit.file;
    }
    if (hit) {
      this.evict(storageKey);
    }

    const file = await this.inner.get(storageKey);
    if (!file) return null;

    this.remember(storageKey, file, now);
    return file;
  }

  async delete(storageKey: string): Promise<void> {
    this.evict(storageKey);
    await this.inner.delete(storageKey);
  }

  healthCheck() {
    return this.inner.healthCheck?.();
  }

  private remember(storageKey: string, file: StoredFile, now: number): void {
    const size = file.buffer.byteLength;
    if (size > this.options.maxBytes) return;

    while (
      this.cache.size >= this.options.maxEntries ||
      this.cacheBytes + size > this.options.maxBytes
    ) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.evict(oldest);
    }

    this.cache.set(storageKey, { file, expiresAt: now + this.options.ttlMs });
    this.cacheBytes += size;
  }

  private evict(storageKey: string): void {
    const entry = this.cache.get(storageKey);
    if (!entry) return;
    this.cacheBytes -= entry.file.buffer.byteLength;
    this.cache.delete(storageKey);
  }
}
