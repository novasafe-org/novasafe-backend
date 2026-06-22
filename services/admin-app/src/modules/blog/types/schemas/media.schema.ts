import { z } from "zod";
import { isoDateSchema, objectIdSchema, paginationSchema, urlSchema } from "./common.schema";

const mimeTypeSchema = z
  .string()
  .regex(/^[a-z]+\/[a-z0-9.+-]+$/i, "Invalid MIME type")
  .max(100);

export const createMediaSchema = z.object({
  filename: z.string().min(1).max(255),
  original_name: z.string().min(1).max(255),
  r2_key: z.string().min(1).max(512),
  url: urlSchema,
  mime_type: mimeTypeSchema,
  size: z.number().int().positive().max(52_428_800),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  alt_text: z.string().max(500).nullable().optional(),
  uploaded_by: z.string().min(1).max(128),
});

export const updateMediaSchema = createMediaSchema.partial();

export const listMediaFilterSchema = paginationSchema.extend({
  mime_type: mimeTypeSchema.optional(),
});

export const mediaDocumentSchema = createMediaSchema.extend({
  _id: objectIdSchema,
  uploaded_at: isoDateSchema,
});

export type CreateMediaSchema = z.infer<typeof createMediaSchema>;
export type UpdateMediaSchema = z.infer<typeof updateMediaSchema>;
export type ListMediaFilterSchema = z.infer<typeof listMediaFilterSchema>;
export type MediaDocumentSchema = z.infer<typeof mediaDocumentSchema>;
