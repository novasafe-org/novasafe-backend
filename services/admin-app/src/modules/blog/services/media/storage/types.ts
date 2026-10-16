export type StoredFile = {
  buffer: Buffer;
  mimeType: string;
};

export type MediaStoragePutInput = {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  /** Suggested object path (local layout); cloud providers may ignore. */
  logicalPath: string;
};

export type MediaStoragePutResult = {
  /** Opaque key persisted on MediaDocument.r2_key */
  storageKey: string;
};

export type MediaStorageHealth = {
  ok: boolean;
  provider: string;
  detail?: string;
};

export interface MediaStorageProvider {
  readonly providerId: string;
  put(input: MediaStoragePutInput): Promise<MediaStoragePutResult>;
  get(storageKey: string): Promise<StoredFile | null>;
  delete(storageKey: string): Promise<void>;
  healthCheck?(): Promise<MediaStorageHealth>;
}
