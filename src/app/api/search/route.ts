import { NextResponse } from "next/server";
import { searchAll } from "@/features/discovery/queries";
import { searchQuerySchema } from "@/features/discovery/schemas";
import { getViewer } from "@/lib/viewer";

// Thin on purpose, same pattern as `api/ai/*`: the tested logic lives in
// `queries.ts`/`schemas.ts`, this just validates `q` and calls `searchAll`.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = searchQuerySchema.safeParse({ q: searchParams.get("q") });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  }

  const viewer = await getViewer();
  const results = await searchAll(parsed.data.q, viewer?.id);

  return NextResponse.json(results);
}
