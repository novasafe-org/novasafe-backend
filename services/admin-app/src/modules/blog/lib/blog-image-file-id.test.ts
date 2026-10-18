import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isBlogImageFileId, parseBlogImageFileId } from "./blog-image-file-id";

describe("blog image file id", () => {
  it("accepts typical Google Drive file ids", () => {
    const id = "1a2B3c4D5e6F7g8H9i0J_k-l";
    assert.equal(parseBlogImageFileId(id), id);
    assert.equal(isBlogImageFileId(id), true);
  });

  it("rejects empty and malformed ids", () => {
    assert.throws(() => parseBlogImageFileId(""), /Invalid blog image file id/);
    assert.throws(() => parseBlogImageFileId("short"), /Invalid blog image file id/);
    assert.throws(() => parseBlogImageFileId("bad id!"), /Invalid blog image file id/);
    assert.equal(isBlogImageFileId("short"), false);
  });
});
