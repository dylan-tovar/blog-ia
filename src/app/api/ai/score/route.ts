import { handleScore } from "@/features/ai/handlers.server";
import { runAiRoute } from "@/features/ai/route-runner.server";
import { postAiRequestSchema } from "@/features/ai/schemas";

export const maxDuration = 30;

export function POST(request: Request) {
  return runAiRoute(request, { schema: postAiRequestSchema, handler: handleScore });
}
