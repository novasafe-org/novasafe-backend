import { z } from "zod";
import { OBJECT_ID_REGEX } from "@/types/documents/common";

export const objectIdSchema = z
  .string()
  .regex(OBJECT_ID_REGEX, "Invalid ObjectId");

export const slugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens");

export const urlSchema = z.string().url().max(2048);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const postAuthorSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  email: z.string().email().max(320).optional(),
});

export const postStatusSchema = z.enum(["draft", "published", "scheduled", "archived"]);

export const isoDateSchema = z.coerce.date();

export const isoDateStringSchema = z.string().datetime();
