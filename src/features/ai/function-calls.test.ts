import { describe, expect, it } from "vitest";
import { CHAT_TOOL_DECLARATIONS, modelPartsToStreamParts } from "./function-calls";
import { editActionSchema } from "./schemas";

const call = (name: string, args: Record<string, unknown>) => ({ functionCall: { name, args } });

describe("modelPartsToStreamParts", () => {
  it("maps text parts to text and skips empty and thought parts", () => {
    const { parts } = modelPartsToStreamParts([{ text: "Hola" }, { text: "" }, { text: "pensando", thought: true }, {}]);

    expect(parts).toEqual([{ kind: "text", text: "Hola" }]);
  });

  it("returns nothing for a chunk without parts", () => {
    expect(modelPartsToStreamParts(undefined)).toEqual({ parts: [], dropped: [] });
  });

  it("maps a valid propose_edit call to an action", () => {
    const { parts, dropped } = modelPartsToStreamParts([
      call("propose_edit", { op: "insert_after_block", blockId: "b2", markdown: "## Nuevo", label: "Agregar" }),
    ]);

    expect(parts).toEqual([
      { kind: "action", action: { op: "insert_after_block", blockId: "b2", markdown: "## Nuevo", label: "Agregar" } },
    ]);
    expect(dropped).toEqual([]);
  });

  it("keeps the order of text and calls within a chunk", () => {
    const { parts } = modelPartsToStreamParts([
      { text: "Te propongo esto." },
      call("propose_edit", { op: "append", markdown: "Fin" }),
    ]);

    expect(parts.map((part) => part.kind)).toEqual(["text", "action"]);
  });

  it("maps update_plan to pending steps and fills missing ids", () => {
    const { parts } = modelPartsToStreamParts([
      call("update_plan", { steps: [{ id: "outline", label: "Armar el esquema" }, { label: "Redactar" }] }),
    ]);

    expect(parts).toEqual([
      { kind: "step", step: { id: "outline", label: "Armar el esquema", status: "pending" } },
      { kind: "step", step: { id: "plan-2", label: "Redactar", status: "pending" } },
    ]);
  });

  it("does not let a plan step reuse a reserved step id", () => {
    const { parts } = modelPartsToStreamParts([call("update_plan", { steps: [{ id: "read", label: "Leer" }] })]);

    expect(parts).toEqual([{ kind: "step", step: { id: "plan-1", label: "Leer", status: "pending" } }]);
  });

  it("maps a valid present_analysis call to an analysis", () => {
    const analysisPayload = {
      score: 85,
      metrics: {
        clarity: 90,
        structure: 80,
        tone: 85,
        engagement: 80,
        grammar: 90,
      },
      verdict: "Buen artículo con bases sólidas.",
      strengths: ["Excelente introducción", "Buen ritmo"],
      weaknesses: ["Falta profundizar en la conclusión"],
      improvements: ["Agregar un llamado a la acción al final"],
    };

    const { parts, dropped } = modelPartsToStreamParts([
      call("present_analysis", analysisPayload),
    ]);

    expect(parts).toEqual([{ kind: "analysis", analysis: analysisPayload }]);
    expect(dropped).toEqual([]);
  });

  it.each([
    ["propose_edit with an unknown op", call("propose_edit", { op: "explode", markdown: "x" })],
    ["propose_edit without markdown", call("propose_edit", { op: "append" })],
    ["propose_edit without args", { functionCall: { name: "propose_edit" } }],
    ["update_plan without steps", call("update_plan", { steps: [] })],
    ["present_analysis with invalid score", call("present_analysis", { score: 150 })],
  ])("drops %s and reports its name", (_label, part) => {
    const { parts, dropped } = modelPartsToStreamParts([part]);

    expect(parts).toEqual([]);
    expect(dropped).toEqual([part.functionCall.name]);
  });

  it("drops a call to an unknown tool without echoing its name", () => {
    const { parts, dropped } = modelPartsToStreamParts([call("rm_rf", { path: "/" })]);

    expect(parts).toEqual([]);
    expect(dropped).toEqual(["unknown"]);
  });

  it("keeps the valid parts when another one in the chunk is invalid", () => {
    const { parts, dropped } = modelPartsToStreamParts([
      call("propose_edit", { op: "nope" }),
      { text: "sigue" },
      call("propose_edit", { op: "append", markdown: "ok" }),
    ]);

    expect(parts.map((part) => part.kind)).toEqual(["text", "action"]);
    expect(dropped).toEqual(["propose_edit"]);
  });
});

describe("CHAT_TOOL_DECLARATIONS", () => {
  const byName = Object.fromEntries(CHAT_TOOL_DECLARATIONS.map((declaration) => [declaration.name, declaration]));

  it("declares propose_edit and present_analysis", () => {
    expect(Object.keys(byName).sort()).toEqual(["present_analysis", "propose_edit"]);
  });

  it("offers exactly the ops the action schema accepts", () => {
    const schemaOps = editActionSchema.options.map((option) => option.shape.op.value).sort();
    const declared = (byName.propose_edit.parametersJsonSchema as { properties: { op: { enum: string[] } } }).properties.op.enum;

    expect([...declared].sort()).toEqual(schemaOps);
  });

  it("requires op and markdown on propose_edit", () => {
    expect((byName.propose_edit.parametersJsonSchema as { required: string[] }).required).toEqual(["op", "markdown"]);
  });

  it("declares present_analysis with required fields", () => {
    const schema = byName.present_analysis.parametersJsonSchema as { required: string[] };
    expect(schema.required).toEqual([
      "score",
      "metrics",
      "verdict",
      "strengths",
      "weaknesses",
      "improvements",
    ]);
  });
});
