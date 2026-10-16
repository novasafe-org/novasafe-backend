import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { STORAGE_KEY_LOCAL_PREFIX, localRelativePath } from "./keys";
import type { MediaStorageProvider, MediaStoragePutInput, StoredFile } from "./types";

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

export class LocalMediaStorageProvider implements MediaStorageProvider {
  readonly providerId = "local";

  constructor(private readonly basePath: string) {}

  private resolvePath(relativePath: string): string {
    return join(this.basePath, relativePath);
  }

  async put(input: MediaStoragePutInput) {
    const relative = input.logicalPath.replace(/^\//, "");
    const storageKey = `${STORAGE_KEY_LOCAL_PREFIX}${relative}`;
    const filePath = this.resolvePath(relative);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.buffer);
    return { storageKey };
  }

  async get(storageKey: string): Promise<StoredFile | null> {
    try {
      const relative = localRelativePath(storageKey);
      const buffer = await readFile(this.resolvePath(relative));
      const ext = relative.split(".").pop()?.toLowerCase() ?? "";
      return { buffer, mimeType: guessMimeType(ext) };
    } catch {
      return null;
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      const relative = localRelativePath(storageKey);
      await unlink(this.resolvePath(relative));
    } catch {
      // ignore missing files
    }
  }

  async healthCheck() {
    return { ok: true, provider: this.providerId, detail: this.basePath };
  }
}
