import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AppError } from "@/lib/errors";
import { HTTP } from "@/lib/constants";
import { BlogImagesService } from "./blog-images.service";
import type { BlogImagesConfig } from "./config";
import type { DriveFileContent, DriveFileMetadata } from "./google-drive-blog-images.client";

const baseConfig: BlogImagesConfig = {
  folderIds: new Set(["folder-allowed"]),
  allowedFileIds: new Set(["explicit-allow"]),
  credentialsJson: "{}",
  fileExtensions: ["png", "webp"],
};

function createMockDrive(handlers: {
  getMetadata?: (fileId: string) => Promise<DriveFileMetadata | null>;
  download?: (fileId: string) => Promise<DriveFileContent>;
  getParentFolderIds?: (folderId: string) => Promise<string[]>;
  findFileIdByNameInFolders?: (folderIds: readonly string[], filename: string) => Promise<string | null>;
  findImageFileIdForSlug?: (
    folderIds: readonly string[],
    filenamesInPriorityOrder: readonly string[],
  ) => Promise<string | null>;
  findFileIdByNameWithAncestorCheck?: (
    filename: string,
    allowedFolderIds: ReadonlySet<string> | readonly string[],
    isAllowed: (parentIds: string[]) => Promise<boolean>,
  ) => Promise<string | null>;
}) {
  return {
    getMetadata: handlers.getMetadata ?? (async () => null),
    download: handlers.download ?? (async () => ({ buffer: Buffer.from("x"), mimeType: "image/png" })),
    getParentFolderIds: handlers.getParentFolderIds ?? (async () => []),
    findFileIdByNameInFolders: handlers.findFileIdByNameInFolders ?? (async () => null),
    findImageFileIdForSlug: handlers.findImageFileIdForSlug ?? (async () => null),
    findFileIdByNameWithAncestorCheck: handlers.findFileIdByNameWithAncestorCheck ?? (async () => null),
  };
}

describe("BlogImagesService.serve", () => {
  it("returns image bytes for files in an approved folder", async () => {
    const fileId = "abcdefghijklmnop";
    const service = new BlogImagesService(
      baseConfig,
      createMockDrive({
        getMetadata: async () => ({
          id: fileId,
          mimeType: "image/jpeg",
          parents: ["folder-allowed"],
          trashed: false,
        }),
        download: async () => ({
          buffer: Buffer.from([1, 2, 3]),
          mimeType: "image/jpeg",
        }),
      }),
    );

    const result = await service.serve(fileId);
    assert.equal(result.mimeType, "image/jpeg");
    assert.deepEqual(result.buffer, Buffer.from([1, 2, 3]));
  });

  it("allows explicitly listed file ids even outside folder parents", async () => {
    const fileId = "explicit-allow";
    const service = new BlogImagesService(
      baseConfig,
      createMockDrive({
        getMetadata: async () => ({
          id: fileId,
          mimeType: "image/png",
          parents: ["other-folder"],
          trashed: false,
        }),
        download: async () => ({
          buffer: Buffer.from("png"),
          mimeType: "image/png",
        }),
      }),
    );

    const result = await service.serve(fileId);
    assert.equal(result.mimeType, "image/png");
  });

  it("returns not found for missing Drive files", async () => {
    const service = new BlogImagesService(
      baseConfig,
      createMockDrive({ getMetadata: async () => null }),
    );

    await assert.rejects(() => service.serve("abcdefghijklmnop"), (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.status, HTTP.NOT_FOUND);
      return true;
    });
  });

  it("rejects invalid file ids", async () => {
    const service = new BlogImagesService(baseConfig, createMockDrive({}));
    await assert.rejects(() => service.serve("nope"), (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.status, HTTP.BAD_REQUEST);
      return true;
    });
  });

  it("forbids files outside approved folders", async () => {
    const fileId = "abcdefghijklmnop";
    const service = new BlogImagesService(
      baseConfig,
      createMockDrive({
        getMetadata: async () => ({
          id: fileId,
          mimeType: "image/jpeg",
          parents: ["other-folder"],
          trashed: false,
        }),
        getParentFolderIds: async () => [],
      }),
    );

    await assert.rejects(() => service.serve(fileId), (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.status, HTTP.FORBIDDEN);
      return true;
    });
  });

  it("allows files in nested subfolders when ancestor is approved", async () => {
    const fileId = "abcdefghijklmnop";
    const service = new BlogImagesService(
      baseConfig,
      createMockDrive({
        getMetadata: async () => ({
          id: fileId,
          mimeType: "image/jpeg",
          parents: ["nested-folder"],
          trashed: false,
        }),
        getParentFolderIds: async (folderId) =>
          folderId === "nested-folder" ? ["folder-allowed"] : [],
        download: async () => ({
          buffer: Buffer.from([9]),
          mimeType: "image/jpeg",
        }),
      }),
    );

    const result = await service.serve(fileId);
    assert.equal(result.buffer[0], 9);
  });

  it("maps upstream Drive failures to service unavailable", async () => {
    const fileId = "abcdefghijklmnop";
    const service = new BlogImagesService(
      baseConfig,
      createMockDrive({
        getMetadata: async () => ({
          id: fileId,
          mimeType: "image/jpeg",
          parents: ["folder-allowed"],
          trashed: false,
        }),
        download: async () => {
          throw new Error("network down");
        },
      }),
    );

    await assert.rejects(() => service.serve(fileId), (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.status, HTTP.SERVICE_UNAVAILABLE);
      return true;
    });
  });

  it("resolves slug-based filenames at request time", async () => {
    const fileId = "abcdefghijklmnop";
    const service = new BlogImagesService(
      baseConfig,
      createMockDrive({
        findImageFileIdForSlug: async (_folders, names) =>
          names.includes("my-post.png") ? fileId : null,
        findFileIdByNameInFolders: async (_folders, filename) =>
          filename === "my-post.png" ? fileId : null,
        getMetadata: async () => ({
          id: fileId,
          mimeType: "image/png",
          parents: ["folder-allowed"],
          trashed: false,
        }),
        download: async () => ({
          buffer: Buffer.from("ok"),
          mimeType: "image/png",
        }),
      }),
    );

    const result = await service.serveBySlug("my-post");
    assert.equal(result.mimeType, "image/png");
  });

  it("returns 503 when blog images are not configured", async () => {
    const service = new BlogImagesService(null, null);
    await assert.rejects(() => service.serve("abcdefghijklmnop"), (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.status, HTTP.SERVICE_UNAVAILABLE);
      return true;
    });
  });
});
