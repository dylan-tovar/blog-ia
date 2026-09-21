import { CHAT_MAX_STEPS, EDIT_LABEL_MAX_CHARS, SYSTEM_STEP_IDS } from "./constants";
import { articleAnalysisSchema, chatPlanSchema, editActionSchema } from "./schemas";
import type { ChatStreamPart } from "./types";

export const PROPOSE_EDIT = "propose_edit";
export const PRESENT_ANALYSIS = "present_analysis";
export const UPDATE_PLAN = "update_plan";

const BLOCK_ID_HINT = "Id de un bloque de la lista, por ejemplo b3.";

type ToolDeclaration = { name: string; description: string; parametersJsonSchema: unknown };

// Flat on purpose: a `oneOf` per op is less reliable with function calling. The per-op required
// fields are explained in the descriptions and enforced by `editActionSchema` afterwards.
export const CHAT_TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: PROPOSE_EDIT,
    description:
      "Propone un cambio concreto al artículo. El autor lo ve como una tarjeta y decide si lo aplica. Una llamada por cambio.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        op: {
          type: "string",
          enum: ["insert_after_block", "insert_at_selection", "append", "replace_block", "replace_selection", "replace_range"],
          description:
            "insert_after_block: inserta después de blockId. append: agrega al final. replace_block: reemplaza blockId. replace_range: reemplaza de fromBlockId a toBlockId inclusive. replace_selection e insert_at_selection: operan sobre la selección del autor.",
        },
        blockId: { type: "string", description: `${BLOCK_ID_HINT} Obligatorio en insert_after_block y replace_block.` },
        fromBlockId: { type: "string", description: `${BLOCK_ID_HINT} Primer bloque del rango; obligatorio en replace_range.` },
        toBlockId: { type: "string", description: `${BLOCK_ID_HINT} Último bloque del rango; obligatorio en replace_range.` },
        markdown: { type: "string", description: "Contenido nuevo en Markdown, sin texto explicativo alrededor." },
        label: {
          type: "string",
          maxLength: EDIT_LABEL_MAX_CHARS,
          description: "Descripción breve del cambio para mostrar en la tarjeta, por ejemplo: Agregar conclusión.",
        },
      },
      required: ["op", "markdown"],
    },
  },
  {
    name: PRESENT_ANALYSIS,
    description:
      "Presenta una auditoría editorial completa del artículo con un puntaje general (0-100), desglose de métricas, fortalezas, puntos ciegos o inconsistencias y áreas de mejora accionables. Usala cuando el autor pida analizar o calificar su artículo.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        score: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description: "Puntaje general del artículo de 0 a 100.",
        },
        metrics: {
          type: "object",
          properties: {
            clarity: { type: "integer", minimum: 0, maximum: 100, description: "Claridad y legibilidad (0-100)." },
            structure: { type: "integer", minimum: 0, maximum: 100, description: "Estructura y progresión de ideas (0-100)." },
            tone: { type: "integer", minimum: 0, maximum: 100, description: "Consistencia de tono y voz (0-100)." },
            engagement: { type: "integer", minimum: 0, maximum: 100, description: "Capacidad de atrapar al lector (0-100)." },
            grammar: { type: "integer", minimum: 0, maximum: 100, description: "Ortografía y gramática (0-100)." },
          },
          required: ["clarity", "structure", "tone", "engagement", "grammar"],
        },
        verdict: {
          type: "string",
          description: "Veredicto editorial conciso en 1 o 2 oraciones resumiendo el estado del artículo.",
        },
        strengths: {
          type: "array",
          items: { type: "string" },
          description: "Lista de 3 a 5 puntos positivos o fortalezas del artículo actual (qué está bien).",
        },
        weaknesses: {
          type: "array",
          items: { type: "string" },
          description: "Lista de 2 a 4 inconsistencias, puntos ciegos o aspectos flojos (qué falta o no está del todo bien).",
        },
        improvements: {
          type: "array",
          items: { type: "string" },
          description: "Lista de 3 a 5 sugerencias y recomendaciones prioritarias y accionables para el autor.",
        },
      },
      required: ["score", "metrics", "verdict", "strengths", "weaknesses", "improvements"],
    },
  },
];

// Structural subset of the SDK's `Part`, so this stays testable without the SDK.
export type ModelPart = {
  text?: string;
  thought?: boolean;
  functionCall?: { name?: string; args?: Record<string, unknown> };
};

// `dropped` holds only known tool names (never model output), so it is safe to log.
export function modelPartsToStreamParts(modelParts: readonly ModelPart[] | undefined): {
  parts: ChatStreamPart[];
  dropped: string[];
} {
  const parts: ChatStreamPart[] = [];
  const dropped: string[] = [];

  for (const part of modelParts ?? []) {
    if (part.functionCall) {
      const { name, args } = part.functionCall;

      if (name === PROPOSE_EDIT) {
        const action = editActionSchema.safeParse(args);
        if (action.success) parts.push({ kind: "action", action: action.data });
        else dropped.push(PROPOSE_EDIT);
      } else if (name === PRESENT_ANALYSIS) {
        const analysis = articleAnalysisSchema.safeParse(args);
        if (analysis.success) parts.push({ kind: "analysis", analysis: analysis.data });
        else dropped.push(PRESENT_ANALYSIS);
      } else if (name === UPDATE_PLAN) {
        const plan = chatPlanSchema.safeParse(args);
        if (plan.success) {
          plan.data.steps.forEach((step, index) => {
            const id = step.id && !(SYSTEM_STEP_IDS as readonly string[]).includes(step.id) ? step.id : `plan-${index + 1}`;
            parts.push({ kind: "step", step: { id, label: step.label, status: "pending" } });
          });
        } else dropped.push(UPDATE_PLAN);
      } else {
        dropped.push("unknown");
      }
    } else if (part.text && !part.thought) {
      parts.push({ kind: "text", text: part.text });
    }
  }

  return { parts, dropped };
}
