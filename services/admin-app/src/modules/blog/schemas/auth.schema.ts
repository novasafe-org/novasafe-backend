import { z } from "zod";

export const loginBodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
