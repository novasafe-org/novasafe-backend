import { z } from "zod";
import { isoDateSchema, objectIdSchema, slugSchema } from "./common.schema";

export const createTagSchema = z.object({
  name: z.string().min(1).max(80),
  slug: slugSchema.optional(),
});

export const updateTagSchema = createTagSchema.partial();

export const tagDocumentSchema = createTagSchema.extend({
  _id: objectIdSchema,
  created_at: isoDateSchema,
});

export type CreateTagSchema = z.infer<typeof createTagSchema>;
export type UpdateTagSchema = z.infer<typeof updateTagSchema>;
export type TagDocumentSchema = z.infer<typeof tagDocumentSchema>;
