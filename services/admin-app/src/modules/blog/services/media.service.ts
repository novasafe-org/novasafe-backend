import type { VercelResponse } from "@vercel/node";
import type { AppConfig } from "@/types/config";
import type { AdminContext } from "@/types/auth";
import type { ObjectIdString } from "@/types/documents/common";
import type { ImageTransformOptions, MediaDocument } from "@/types/documents/media";
import { MEDIA_STORAGE_PREFIX } from "@/lib/constants";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { MongoRepositories } from "@/repositories/types";
import { newObjectId } from "@/repositories/helpers";
import { createMediaProvider, type MediaProvider } from "./media/provider";

export type UploadMediaInput = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
  altText?: string;
};

export class MediaService {
  private readonly provider: MediaProvider;

  constructor(
    private readonly config: AppConfig,
    private readonly mongo: MongoRepositories,
    provider?: MediaProvider,
  ) {
    this.provider = provider ?? createMediaProvider(config.MEDIA_STORAGE_PATH);
  }

  getMaxBytes(): number {
    return Number.parseInt(this.config.MEDIA_MAX_BYTES, 10) || 5_242_880;
  }

  getAllowedMimeTypes(): Set<string> {
    return new Set(
      this.config.MEDIA_ALLOWED_MIME_TYPES.split(",").map((t) => t.trim()),
    );
  }

  validateFile(mimeType: string, size: number): void {
    const allowed = this.getAllowedMimeTypes();
    if (!allowed.has(mimeType)) {
      throw new ValidationError("Unsupported file type", {
        allowed: [...allowed],
        received: mimeType,
      });
    }
    if (size > this.getMaxBytes()) {
      throw new ValidationError("File too large", {
        maxBytes: this.getMaxBytes(),
        size,
      });
    }
    if (size <= 0) {
      throw new ValidationError("File is empty");
    }
  }

  buildPublicUrl(requestUrl: string, mediaId: string, transform?: ImageTransformOptions): string {
    const base = new URL(requestUrl);
    const url = new URL(`${base.origin}${this.config.API_BASE_PATH}/media/${mediaId}`);
    if (transform?.width) url.searchParams.set("w", String(transform.width));
    if (transform?.height) url.searchParams.set("h", String(transform.height));
    if (transform?.format) url.searchParams.set("format", transform.format);
    if (transform?.quality) url.searchParams.set("q", String(transform.quality));
    if (transform?.fit) url.searchParams.set("fit", transform.fit);
    return url.toString();
  }

  async upload(
    input: UploadMediaInput,
    admin: AdminContext,
    requestUrl: string,
  ): Promise<MediaDocument> {
    this.validateFile(input.mimeType, input.size);

    const mediaId = newObjectId();
    const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const storageKey = `${MEDIA_STORAGE_PREFIX}${mediaId}/${safeName}`;

    await this.provider.put(storageKey, input.buffer, input.mimeType);

    const url = this.buildPublicUrl(requestUrl, mediaId);

    return this.mongo.media.create({
      _id: mediaId as ObjectIdString,
      filename: safeName,
      original_name: input.filename,
      r2_key: storageKey,
      url,
      mime_type: input.mimeType,
      size: input.size,
      width: null,
      height: null,
      alt_text: input.altText ?? null,
      uploaded_by: admin.id,
    });
  }

  private resolveStorageKey(asset: MediaDocument): string {
    return asset.r2_key ?? `${MEDIA_STORAGE_PREFIX}${asset._id}/${asset.filename}`;
  }

  async delete(id: string, options: { force?: boolean } = {}): Promise<void> {
    const asset = await this.mongo.media.findById(id);
    if (!asset) return;

    if (!options.force) {
      const refs = await this.mongo.posts.countMediaReferences(id, asset.url);
      if (refs > 0) {
        throw new ConflictError("Media is referenced by one or more posts", { references: refs });
      }
    }

    await this.provider.delete(this.resolveStorageKey(asset));
    await this.mongo.media.delete(id);
  }

  async deleteUnused(): Promise<number> {
    const result = await this.mongo.media.list({}, { page: 1, perPage: 500 });
    let removed = 0;

    for (const asset of result.items) {
      const refs = await this.mongo.posts.countMediaReferences(asset._id, asset.url);
      if (refs === 0) {
        await this.provider.delete(this.resolveStorageKey(asset));
        await this.mongo.media.delete(asset._id);
        removed += 1;
      }
    }

    return removed;
  }

  parseTransformParams(searchParams: URLSearchParams): ImageTransformOptions | undefined {
    const width = searchParams.get("w");
    const height = searchParams.get("h");
    const format = searchParams.get("format");
    const quality = searchParams.get("q");
    const fit = searchParams.get("fit");

    if (!width && !height && !format && !quality && !fit) return undefined;

    const transform: ImageTransformOptions = {};
    if (width) transform.width = Number.parseInt(width, 10);
    if (height) transform.height = Number.parseInt(height, 10);
    if (format && ["webp", "avif", "jpeg", "png", "auto"].includes(format)) {
      transform.format = format as ImageTransformOptions["format"];
    }
    if (quality) transform.quality = Math.min(100, Math.max(1, Number.parseInt(quality, 10)));
    if (fit && ["scale-down", "contain", "cover", "crop", "pad"].includes(fit)) {
      transform.fit = fit as ImageTransformOptions["fit"];
    }

    return transform;
  }

  async serveBuffer(asset: MediaDocument): Promise<{ buffer: Buffer; mimeType: string }> {
    const stored = await this.provider.get(this.resolveStorageKey(asset));
    if (!stored) throw new NotFoundError("Media file");
    return { buffer: stored.buffer, mimeType: asset.mime_type };
  }

  async serve(
    asset: MediaDocument,
    res: VercelResponse,
    _transform?: ImageTransformOptions,
  ): Promise<void> {
    const stored = await this.provider.get(this.resolveStorageKey(asset));
    if (!stored) throw new NotFoundError("Media file");

    res.setHeader("Content-Type", asset.mime_type);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(stored.buffer);
  }
}

export function createMediaService(
  config: AppConfig,
  mongo: MongoRepositories,
): MediaService {
  return new MediaService(config, mongo);
}
