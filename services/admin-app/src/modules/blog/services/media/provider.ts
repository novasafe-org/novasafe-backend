import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type StoredFile = {
  buffer: Buffer;
  mimeType: string;
};

export interface MediaProvider {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
}

export class LocalMediaProvider implements MediaProvider {
  constructor(private readonly basePath: string) {}

  private resolvePath(key: string): string {
    return join(this.basePath, key);
  }

  async put(key: string, data: Buffer, _mimeType: string): Promise<void> {
    const filePath = this.resolvePath(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async get(key: string): Promise<StoredFile | null> {
    try {
      const buffer = await readFile(this.resolvePath(key));
      const ext = key.split(".").pop()?.toLowerCase() ?? "";
      const mimeType = guessMimeType(ext);
      return { buffer, mimeType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolvePath(key));
    } catch {
      // ignore missing files
    }
  }
}

function guessMimeType(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
  };
  return map[ext] ?? "application/octet-stream";
}

export function createMediaProvider(storagePath: string): MediaProvider {
  return new LocalMediaProvider(storagePath);
}
