import { z } from "zod";
import { idSchema } from "@/features/posts/schemas";

export const setLikeSchema = z.object({
  postId: idSchema,
  liked: z.boolean(),
});
