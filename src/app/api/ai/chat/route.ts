import { handleChat } from "@/features/ai/handlers.server";
import { runAiStreamRoute } from "@/features/ai/route-runner.server";
import { chatRequestSchema } from "@/features/ai/schemas";

export const maxDuration = 30;

export function POST(request: Request) {
  return runAiStreamRoute(request, { schema: chatRequestSchema, handler: handleChat });
}
