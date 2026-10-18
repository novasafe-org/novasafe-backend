import { ERROR_CODES, HTTP } from "@/lib/constants";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { isMediaStorageError } from "../media/storage/errors";
import type { BlogImagesConfig } from "./config";
import { loadBlogImagesConfig } from "./config";
import {
  GoogleDriveBlogImagesClient,
  type DriveFileContent,
  type DriveFileMetadata,
} from "./google-drive-blog-images.client";
import { parseBlogImageFileId } from "@/lib/blog-image-file-id";
import { blogImageFilename, parseBlogImageSlug } from "@/lib/blog-image-slug";

export type BlogImageResult = DriveFileContent;

export type BlogImagesDrive = {
  getMetadata(fileId: string): Promise<DriveFileMetadata | null>;
  download(fileId: string): Promise<DriveFileContent>;
  findFileIdByNameInFolders(folderIds: readonly string[], filename: string): Promise<string | null>;
  findImageFileIdForSlug(
    folderIds: readonly string[],
    filenamesInPriorityOrder: readonly string[],
  ): Promise<string | null>;
  findFileIdByNameWithAncestorCheck(
    filename: string,
    allowedFolderIds: ReadonlySet<string> | readonly string[],
    isAllowed: (parentIds: string[]) => Promise<boolean>,
  ): Promise<string | null>;
  getParentFolderIds(folderId: string): Promise<string[]>;
};

export class BlogImagesService {
  constructor(
    private readonly config: BlogImagesConfig | null,
    private readonly drive: BlogImagesDrive | null,
  ) {}

  static create(): BlogImagesService {
    const config = loadBlogImagesConfig();
    const drive = config ? new GoogleDriveBlogImagesClient(config.credentialsJson) : null;
    return new BlogImagesService(config, drive);
  }

  isConfigured(): boolean {
    return Boolean(this.config && this.drive);
  }

  private assertConfigured(): void {
    if (!this.config || !this.drive) {
      throw new AppError("Blog image delivery is not configured (requires MEDIA_PROVIDER=google_drive)", {
        status: HTTP.SERVICE_UNAVAILABLE,
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
      });
    }
  }

  private async isFileAllowed(fileId: string, meta: DriveFileMetadata): Promise<boolean> {
    const { config } = this;
    if (!config) return false;

    if (config.allowedFileIds.has(fileId)) return true;

    if (!meta.mimeType.startsWith("image/")) {
      return false;
    }

    return this.isUnderApprovedFolders(meta.parents, config.folderIds);
  }

  /** Walks up Drive parent folders (handles images in subfolders of the shared root). */
  private async isUnderApprovedFolders(
    startFolderIds: string[],
    allowedFolderIds: ReadonlySet<string>,
  ): Promise<boolean> {
    const seen = new Set<string>();
    const queue = [...startFolderIds];

    while (queue.length > 0) {
      const folderId = queue.shift()!;
      if (allowedFolderIds.has(folderId)) return true;
      if (seen.has(folderId)) continue;
      seen.add(folderId);

      const parents = await this.drive!.getParentFolderIds(folderId);
      for (const parent of parents) {
        if (!seen.has(parent)) queue.push(parent);
      }
    }

    return false;
  }

  async serveBySlug(slugRaw: string): Promise<BlogImageResult> {
    this.assertConfigured();
    let slug: string;
    try {
      slug = parseBlogImageSlug(slugRaw);
    } catch (error) {
      throw mapBlogImageError(error);
    }

    const folderIds = [...this.config!.folderIds];
    const filenames = this.config!.fileExtensions.map((ext) => blogImageFilename(slug, ext));

    let fileId: string | null = null;
    try {
      fileId = await this.drive!.findImageFileIdForSlug(folderIds, filenames);
      if (!fileId) {
        for (const filename of filenames) {
          fileId = await this.findImageFileIdByFilename(filename);
          if (fileId) break;
        }
      }
    } catch (error) {
      throw mapBlogImageError(error);
    }

    if (!fileId) {
      throw new NotFoundError("Blog image");
    }

    return this.serve(fileId);
  }

  private async findImageFileIdByFilename(filename: string): Promise<string | null> {
    const folderIds = [...this.config!.folderIds];
    const direct = await this.drive!.findFileIdByNameInFolders(folderIds, filename);
    if (direct) return direct;

    return this.drive!.findFileIdByNameWithAncestorCheck(filename, folderIds, (parents) =>
      this.isUnderApprovedFolders(parents, this.config!.folderIds),
    );
  }

  async serve(fileIdRaw: string): Promise<BlogImageResult> {
    this.assertConfigured();
    let fileId: string;
    try {
      fileId = parseBlogImageFileId(fileIdRaw);
    } catch (error) {
      throw mapBlogImageError(error);
    }

    let meta: DriveFileMetadata | null;
    try {
      meta = await this.drive!.getMetadata(fileId);
    } catch (error) {
      throw mapBlogImageError(error);
    }
    if (!meta || meta.trashed) {
      throw new NotFoundError("Blog image");
    }

    if (!(await this.isFileAllowed(fileId, meta))) {
      throw new ForbiddenError("Blog image is not in an approved folder");
    }

    let content: DriveFileContent;
    try {
      content = await this.drive!.download(fileId);
    } catch (error) {
      throw mapBlogImageError(error);
    }

    if (!content.mimeType.startsWith("image/")) {
      throw new ForbiddenError("Only image files can be served as blog images");
    }

    return content;
  }
}

export function blogImageResponseHeaders(mimeType: string): Record<string, string> {
  return {
    "Content-Type": mimeType,
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "cross-origin",
  };
}

export function mapBlogImageError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (isMediaStorageError(error)) {
    return new AppError(error.message, {
      status: error.status,
      code: error.code,
      details: error.details,
    });
  }
  if (
    error instanceof Error &&
    (error.message === "Invalid blog image file id" || error.message === "Invalid blog image slug")
  ) {
    return new AppError(error.message, {
      status: HTTP.BAD_REQUEST,
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }
  return new AppError("Failed to load blog image", {
    status: HTTP.SERVICE_UNAVAILABLE,
    code: ERROR_CODES.SERVICE_UNAVAILABLE,
  });
}
