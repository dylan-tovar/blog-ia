import { z } from "zod";
import { idSchema } from "@/features/posts/schemas";

export const setRepostSchema = z.object({
  postId: idSchema,
  reposted: z.boolean(),
});
