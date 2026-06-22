import type { VercelRequest } from "@vercel/node";
import busboy from "busboy";
import { ValidationError } from "@/lib/errors";

export type ParsedUpload = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  altText?: string;
};

export function parseMultipartUpload(req: VercelRequest): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers });
    const chunks: Buffer[] = [];
    let filename = "";
    let mimeType = "application/octet-stream";
    let altText: string | undefined;
    let fileReceived = false;

    bb.on("file", (name, stream, info) => {
      if (name !== "file") {
        stream.resume();
        return;
      }

      fileReceived = true;
      filename = info.filename;
      mimeType = info.mimeType;
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    });

    bb.on("field", (name, value) => {
      if (name === "altText") altText = value;
    });

    bb.on("finish", () => {
      if (!fileReceived) {
        reject(new ValidationError("file is required (multipart field name: file)"));
        return;
      }
      resolve({
        buffer: Buffer.concat(chunks),
        filename,
        mimeType,
        altText,
      });
    });

    bb.on("error", reject);
    req.pipe(bb);
  });
}
