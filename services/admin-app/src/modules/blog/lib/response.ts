import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ApiErrorBody, ApiSuccess } from "@/types/api";
import type { AppConfig } from "@/types/config";
import { ERROR_CODES, HTTP } from "@/lib/constants";
import { isAppError } from "@/lib/errors";
import { MongoClientError } from "@/repositories/client/errors";

export function setCors(req: VercelRequest, res: VercelResponse, config: AppConfig): boolean {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  const allowed = config.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  const isAllowed = allowed.includes("*") || Boolean(origin && allowed.includes(origin));

  if (isAllowed && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "86400");

  return isAllowed;
}

export function sendJson<T>(
  res: VercelResponse,
  status: number,
  body: ApiSuccess<T> | ApiErrorBody,
): void {
  res.status(status).json(body);
}

export function sendError(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const body: ApiErrorBody = {
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  };
  sendJson(res, status, body);
}

export function handleError(res: VercelResponse, error: unknown): void {
  if (error instanceof MongoClientError) {
    sendError(res, error.status, error.code, error.message);
    return;
  }

  if (isAppError(error)) {
    sendError(res, error.status, error.code, error.message, error.details);
    return;
  }

  console.error(error);
  sendError(res, HTTP.INTERNAL, ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred");
}

export async function readJsonBody<T = unknown>(req: VercelRequest): Promise<T> {
  if (req.body && typeof req.body === "object") {
    return req.body as T;
  }

  if (typeof req.body === "string" && req.body.length > 0) {
    return JSON.parse(req.body) as T;
  }

  return new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(raw) as T);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}
