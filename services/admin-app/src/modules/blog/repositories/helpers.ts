import type { PaginatedResult, PaginationOptions } from "@/types/documents/common";

const DATE_FIELDS = new Set([
  "created_at",
  "updated_at",
  "published_at",
  "uploaded_at",
]);

/** Generate an ObjectId-like hex string (24 chars). */
export function newObjectId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Normalize BSON dates and legacy Atlas $date extended JSON into native Date objects. */
export function serializeDoc<T extends Record<string, unknown>>(doc: T): T {
  const out = { ...doc } as Record<string, unknown>;

  for (const [key, value] of Object.entries(out)) {
    if (DATE_FIELDS.has(key)) {
      out[key] = coerceDate(value);
      continue;
    }
    if (value && typeof value === "object" && "$date" in (value as Record<string, unknown>)) {
      out[key] = new Date(String((value as { $date: string }).$date));
    }
  }

  return out as T;
}

function coerceDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  if (typeof value === "object" && "$date" in (value as Record<string, unknown>)) {
    return new Date(String((value as { $date: string }).$date));
  }
  return null;
}

export function withTimestamps<T extends Record<string, unknown>>(patch: T): T & { updated_at: Date } {
  return { ...patch, updated_at: new Date() };
}

export function toPaginated<T>(
  items: T[],
  total: number,
  pagination: PaginationOptions,
): PaginatedResult<T> {
  return {
    items,
    total,
    page: pagination.page,
    perPage: pagination.perPage,
    totalPages: Math.ceil(total / pagination.perPage) || 0,
  };
}
