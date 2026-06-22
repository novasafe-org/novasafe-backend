import type { VercelRequest } from "@vercel/node";
import type { ZodType, ZodTypeDef } from "zod";
import { ValidationError } from "@/lib/errors";

export function parseQuery<T>(req: VercelRequest, schema: ZodType<T, ZodTypeDef, unknown>): T {
  const query = req.query ?? {};
  const raw: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(query)) {
    raw[key] = Array.isArray(value) ? value[0] : value;
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError("Validation failed", result.error.flatten());
  }
  return result.data;
}

export async function parseBody<T>(req: VercelRequest, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  let raw: unknown;

  if (req.body !== undefined) {
    raw = req.body;
  } else {
    raw = await readBody(req);
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError("Validation failed", result.error.flatten());
  }
  return result.data;
}

async function readBody(req: VercelRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new ValidationError("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}
