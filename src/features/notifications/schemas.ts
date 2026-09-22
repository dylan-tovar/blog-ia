import { z } from "zod";

export const notificationsQuerySchema = z.object({
  offset: z.number().int().min(0).max(10_000).default(0),
});
