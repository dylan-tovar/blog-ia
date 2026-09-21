import { CHAT_MAX_ACTIONS, SYSTEM_STEP_IDS } from "./constants";
import { AiError } from "./errors";
import type { Block } from "@/features/posts/components/editor/editor-context";
import type { EditAction } from "./schemas";
import type { ChatStreamPart } from "./types";

export type ChatStreamContext = {
  // The blocks the model actually saw (after truncation).
  blocks: readonly Block[];
  // Blocks in the whole document; larger than `blocks.length` when part of it was cut.
  totalBlocks: number;
  hasSelection: boolean;
};

export type DropReason = "unknown_block" | "bad_range" | "no_selection" | "too_many_actions";

// Metadata only: never the markdown the model wrote.
export type DropInfo = { op: EditAction["op"]; reason: DropReason };

const indexOf = (id: string) => Number(id.slice(1));

export function validateAction(action: EditAction, { blocks, totalBlocks, hasSelection }: ChatStreamContext): DropReason | null {
  const ids = new Set(blocks.map((block) => block.id));

  switch (action.op) {
    case "append":
      return null;
    case "insert_after_block":
    case "replace_block":
      return ids.has(action.blockId) ? null : "unknown_block";
    case "insert_at_selection":
    case "replace_selection":
      return hasSelection ? null : "no_selection";
    case "replace_range": {
      if (!ids.has(action.fromBlockId) || !ids.has(action.toBlockId)) return "unknown_block";

      const from = indexOf(action.fromBlockId);
      const to = indexOf(action.toBlockId);
      if (from > to) return "bad_range";

      // When the article was cut, a hole in the range may be a block the model never saw.
      if (totalBlocks > blocks.length) {
        for (let index = from + 1; index < to; index++) {
          if (!ids.has(`b${index}`)) return "bad_range";
        }
      }
      return null;
    }
  }
}

const step = (id: (typeof SYSTEM_STEP_IDS)[number], label: string, status: "running" | "done"): ChatStreamPart => ({
  kind: "step",
  step: { id, label, status },
});

// Wraps the model stream: validates every action against the request's blocks, drops the invalid
// ones, and adds the deterministic steps. The proposal step only appears once there is a proposal
// (or a plan), so a plain text answer is not labelled as one. An answer with neither text nor a
// valid action fails instead of ending silently.
export async function* runChatStream(
  source: AsyncIterable<ChatStreamPart>,
  { onDrop, ...context }: ChatStreamContext & { onDrop?: (info: DropInfo) => void },
): AsyncGenerator<ChatStreamPart> {
  yield step("read", "Leyendo el artículo", "done");
  yield step("analyze", "Analizando estructura", "done");

  let proposing = false;
  let actions = 0;
  let hasText = false;
  let hasAnalysis = false;

  const startProposal = function* () {
    if (proposing) return;
    proposing = true;
    yield step("propose", "Preparando propuesta", "running");
  };

  for await (const part of source) {
    if (part.kind === "text") {
      hasText ||= part.text.trim().length > 0;
      yield part;
      continue;
    }

    if (part.kind === "analysis") {
      hasAnalysis = true;
      yield part;
      continue;
    }

    if (part.kind === "step") {
      yield* startProposal();
      yield part;
      continue;
    }

    const reason = actions >= CHAT_MAX_ACTIONS ? "too_many_actions" : validateAction(part.action, context);
    if (reason) {
      onDrop?.({ op: part.action.op, reason });
      continue;
    }

    actions++;
    yield* startProposal();
    yield part;
  }

  // An empty bubble is worse than an error the user can retry.
  if (!hasText && actions === 0 && !hasAnalysis) throw new AiError("invalid_response");

  if (proposing) yield step("propose", "Preparando propuesta", "done");
}
