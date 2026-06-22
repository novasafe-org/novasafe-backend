import { z } from "zod";
import { isoDateSchema, objectIdSchema, slugSchema } from "./common.schema";

export const createCategorySchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema.optional(),
  description: z.string().max(500).nullable().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const categoryDocumentSchema = createCategorySchema.extend({
  _id: objectIdSchema,
  created_at: isoDateSchema,
});

export type CreateCategorySchema = z.infer<typeof createCategorySchema>;
export type UpdateCategorySchema = z.infer<typeof updateCategorySchema>;
export type CategoryDocumentSchema = z.infer<typeof categoryDocumentSchema>;
