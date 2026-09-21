import { expect, test, type Page } from "@playwright/test";
import { createDraft, register } from "./helpers";

const TOGGLE = "ControlOrMeta+i";
const ITALIC = "ControlOrMeta+Shift+i";

function drawer(page: Page) {
  return page.locator("#ai-chat-drawer");
}

function composer(page: Page) {
  return drawer(page).getByLabel("Mensaje para el asistente");
}

function ndjson(...events: object[]) {
  return events.map((event) => `${JSON.stringify(event)}\n`).join("");
}

function editorBody(page: Page) {
  return page.getByLabel("Contenido del artículo");
}

async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

test.describe("editor AI drawer", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await register(page);
    await createDraft(page);
    await expect(editorBody(page)).toBeVisible();
  });

  test("Cmd/Ctrl+I toggles the drawer and no longer toggles italic", async ({ page }) => {
    const toggle = page.getByRole("button", { name: "Asistente de IA" });
    await expect(drawer(page)).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await editorBody(page).click();
    await page.keyboard.type("hola mundo");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press(TOGGLE);

    await expect(drawer(page)).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(editorBody(page).locator("em")).toHaveCount(0);

    await page.keyboard.press(TOGGLE);
    await expect(drawer(page)).toBeHidden();
    await expect(editorBody(page).locator("em")).toHaveCount(0);
  });

  test("italic still works through Cmd/Ctrl+Shift+I and the toolbar button", async ({ page }) => {
    await editorBody(page).click();
    await page.keyboard.type("hola");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press(ITALIC);
    await expect(editorBody(page).locator("em")).toHaveCount(1);
    await expect(drawer(page)).toBeHidden();

    await page.getByRole("button", { name: "Cursiva" }).click();
    await expect(editorBody(page).locator("em")).toHaveCount(0);
  });

  test("focus moves into the drawer on open and back to the editor on close", async ({ page }) => {
    await editorBody(page).click();
    await page.keyboard.press(TOGGLE);
    await expect(composer(page)).toBeFocused();

    await page.keyboard.press(TOGGLE);
    await expect(drawer(page)).toBeHidden();
    await expect(editorBody(page)).toBeFocused();
  });

  test("the close button hides the drawer and the open state survives a reload", async ({ page }) => {
    await page.getByRole("button", { name: "Asistente de IA" }).click();
    await expect(drawer(page)).toBeVisible();

    await page.reload();
    await expect(drawer(page)).toBeVisible();

    await page.getByRole("button", { name: "Cerrar asistente" }).click();
    await expect(drawer(page)).toBeHidden();

    await page.reload();
    await expect(editorBody(page)).toBeVisible();
    await expect(drawer(page)).toBeHidden();
  });

  test("the article column shrinks next to the drawer instead of sitting under it", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    const main = page.locator("main");

    const closed = await main.boundingBox();
    await page.getByRole("button", { name: "Asistente de IA" }).click();

    await expect.poll(async () => (await main.boundingBox())?.width ?? 0).toBeLessThan(closed!.width);
    await expect.poll(async () => (await drawer(page).boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(320);

    const article = (await main.boundingBox())!;
    const aside = (await drawer(page).boundingBox())!;
    expect(article.x + article.width).toBeLessThanOrEqual(aside.x + 1);
  });

  test("the drawer offers the quick actions and an enabled chat composer", async ({ page }) => {
    await page.getByRole("button", { name: "Asistente de IA" }).click();

    const toolbar = drawer(page).getByRole("toolbar", { name: "Acciones rápidas del asistente" });
    for (const name of ["Estructura", "Títulos", "Tono", "Analizar"]) {
      await expect(toolbar.getByRole("button", { name, exact: true })).toBeEnabled();
    }

    // The empty state also shows the same tools as cards.
    for (const name of [/Generar estructura/, /Sugerir títulos/, /Analizar contenido/]) {
      await expect(drawer(page).getByRole("button", { name })).toBeEnabled();
    }

    await expect(composer(page)).toBeEnabled();
    await expect(drawer(page).getByRole("button", { name: "Enviar mensaje" })).toBeDisabled();
  });

  test("Enter sends, Shift+Enter adds a line, and the answer streams in as Markdown", async ({ page }) => {
    let request: { title: string; blocks: { id: string; markdown: string }[]; messages: { role: string; content: string }[] } | undefined;
    await page.route("**/api/ai/chat", async (route) => {
      request = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson; charset=utf-8",
        body: ndjson(
          { type: "delta", text: "Podés empezar con " },
          { type: "delta", text: "**una pregunta** que enganche." },
          { type: "done" },
        ),
      });
    });

    await editorBody(page).click();
    await page.keyboard.type("Un artículo de prueba");
    await page.getByRole("button", { name: "Asistente de IA" }).click();

    await composer(page).fill("¿Cómo mejoro");
    await composer(page).press("Shift+Enter");
    await composer(page).pressSequentially("la intro?");
    await expect(composer(page)).toHaveValue("¿Cómo mejoro\nla intro?");

    await composer(page).press("Enter");

    await expect(drawer(page).locator("strong", { hasText: "una pregunta" })).toBeVisible();
    await expect(drawer(page).getByRole("button", { name: "Copiar" })).toBeVisible();
    await expect(composer(page)).toHaveValue("");
    expect(request?.blocks).toEqual([expect.objectContaining({ id: "b0", markdown: "Un artículo de prueba" })]);
    expect(request?.messages).toEqual([{ role: "user", content: "¿Cómo mejoro\nla intro?" }]);
  });

  test("a thinking marker shows until the first token, then the reply replaces it", async ({ page }) => {
    await page.route("**/api/ai/chat", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        contentType: "application/x-ndjson",
        body: ndjson({ type: "delta", text: "Respuesta lista." }, { type: "done" }),
      });
    });

    await page.getByRole("button", { name: "Asistente de IA" }).click();
    await composer(page).fill("hola");
    await composer(page).press("Enter");

    await expect(drawer(page).getByText("Pensando…")).toBeVisible();

    await expect(drawer(page).getByText("Respuesta lista.")).toBeVisible();
    await expect(drawer(page).getByText("Pensando…")).toHaveCount(0);
    await expect(drawer(page).locator("time")).toHaveCount(1);
  });

  test("a suggested prompt is sent as the first message", async ({ page }) => {
    await page.route("**/api/ai/chat", (route) =>
      route.fulfill({
        contentType: "application/x-ndjson",
        body: ndjson({ type: "delta", text: "Claro." }, { type: "done" }),
      }),
    );

    await page.getByRole("button", { name: "Asistente de IA" }).click();
    await drawer(page).getByRole("button", { name: "Sugerime ideas para el cierre" }).click();

    await expect(drawer(page).getByText("Claro.")).toBeVisible();
  });

  test("a pre-stream rate limit shows the countdown message and a disabled retry", async ({ page }) => {
    await page.route("**/api/ai/chat", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: { kind: "rate_limited", message: "Esperá un momento", retryAfter: 30, scope: "user" },
        }),
      }),
    );

    await page.getByRole("button", { name: "Asistente de IA" }).click();
    await composer(page).fill("hola");
    await composer(page).press("Enter");

    await expect(drawer(page).getByText(/esperá \d+ s/)).toBeVisible();
    await expect(drawer(page).getByRole("button", { name: "Reintentar" })).toBeDisabled();
  });

  test("a stream cut off before `done` keeps the text and offers a retry", async ({ page }) => {
    await page.route("**/api/ai/chat", async (route) => {
      await route.fulfill({
        contentType: "application/x-ndjson",
        body: ndjson({ type: "delta", text: "Texto parcial" }),
      });
    });

    await page.getByRole("button", { name: "Asistente de IA" }).click();
    await composer(page).fill("hola");
    await composer(page).press("Enter");

    await expect(drawer(page).getByText("Texto parcial")).toBeVisible();
    await expect(drawer(page).getByRole("button", { name: "Reintentar" })).toBeVisible();
  });

  test.describe("edit proposals", () => {
    const STEPS = [
      { type: "step", step: { id: "read", label: "Leyendo el artículo", status: "done" } },
      { type: "step", step: { id: "analyze", label: "Analizando estructura", status: "done" } },
    ];

    async function mockAnswer(page: Page, ...events: object[]) {
      await page.route("**/api/ai/chat", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/x-ndjson; charset=utf-8",
          body: ndjson(...STEPS, ...events, { type: "done" }),
        }),
      );
    }

    async function writeArticle(page: Page, ...paragraphs: string[]) {
      await editorBody(page).click();
      for (const [index, paragraph] of paragraphs.entries()) {
        if (index > 0) await page.keyboard.press("Enter");
        await page.keyboard.type(paragraph);
      }
    }

    async function ask(page: Page, message = "Mejorá el artículo") {
      await page.getByRole("button", { name: "Asistente de IA" }).click();
      await composer(page).fill(message);
      await composer(page).press("Enter");
    }

    const blocksOf = (page: Page) => editorBody(page).locator(":scope > *");

    const insertAfterIntro = {
      op: "insert_after_block",
      blockId: "b0",
      markdown: "## Nueva sección\n\nTexto agregado.",
      label: "Agregar sección",
    };

    test("shows a card with the location and preview, and applies it in the right place", async ({ page }) => {
      await writeArticle(page, "Intro", "Cierre");
      await mockAnswer(page, { type: "delta", text: "Te propongo esto." }, { type: "action", action: insertAfterIntro });
      await ask(page);

      const card = drawer(page).getByRole("region", { name: "Propuesta: Agregar sección" });
      await expect(card).toBeVisible();
      await expect(card.getByText("Después de «Intro»")).toBeVisible();
      await expect(card.getByText("Texto agregado.")).toBeVisible();
      await expect(blocksOf(page)).toHaveText(["Intro", "Cierre"]);

      await card.getByRole("button", { name: /Aplicar/ }).click();

      await expect(blocksOf(page)).toHaveText(["Intro", "Nueva sección", "Texto agregado.", "Cierre"]);
      await expect(editorBody(page).locator("h2")).toHaveText("Nueva sección");
      await expect(card.getByText("Aplicado")).toBeVisible();
    });

    test("undo reverts the applied change in one step and the card can be applied again", async ({ page }) => {
      await writeArticle(page, "Intro", "Cierre");
      await mockAnswer(page, { type: "action", action: insertAfterIntro }, { type: "delta", text: "Listo." });
      await ask(page);

      const card = drawer(page).getByRole("region", { name: "Propuesta: Agregar sección" });
      await card.getByRole("button", { name: /Aplicar/ }).click();
      await expect(blocksOf(page)).toHaveCount(4);

      await card.getByRole("button", { name: /Deshacer/ }).click();

      await expect(blocksOf(page)).toHaveText(["Intro", "Cierre"]);
      await expect(card.getByRole("button", { name: /Aplicar/ })).toBeVisible();
    });

    test("undo explains why it cannot revert when the author kept editing", async ({ page }) => {
      await writeArticle(page, "Intro", "Cierre");
      await mockAnswer(page, { type: "action", action: insertAfterIntro }, { type: "delta", text: "Listo." });
      await ask(page);

      const card = drawer(page).getByRole("region", { name: "Propuesta: Agregar sección" });
      await card.getByRole("button", { name: /Aplicar/ }).click();
      await editorBody(page).getByText("Cierre").click();
      await page.keyboard.press("End");
      await page.keyboard.type(" final");

      await card.getByRole("button", { name: /Deshacer/ }).click();

      await expect(card.getByRole("alert")).toContainText("Editaste el artículo");
      await expect(editorBody(page).getByText("Cierre final")).toBeVisible();
    });

    test("discarding a proposal leaves the article untouched", async ({ page }) => {
      await writeArticle(page, "Intro");
      await mockAnswer(page, { type: "action", action: insertAfterIntro }, { type: "delta", text: "Listo." });
      await ask(page);

      const card = drawer(page).getByRole("region", { name: "Propuesta: Agregar sección" });
      await card.getByRole("button", { name: /Descartar/ }).click();

      await expect(card.getByText("Descartada")).toBeVisible();
      await expect(card.getByRole("button", { name: /Aplicar/ })).toHaveCount(0);
      await expect(blocksOf(page)).toHaveText(["Intro"]);
    });

    test("a proposal becomes stale, with a visible reason, when its block was edited", async ({ page }) => {
      await writeArticle(page, "Intro", "Cierre");
      await mockAnswer(
        page,
        { type: "action", action: { op: "replace_block", blockId: "b1", markdown: "Cierre mejorado", label: "Mejorar cierre" } },
        { type: "delta", text: "Listo." },
      );
      await ask(page);

      await editorBody(page).getByText("Cierre").click();
      await page.keyboard.press("End");
      await page.keyboard.type(" editado");
      const card = drawer(page).getByRole("region", { name: "Propuesta: Mejorar cierre" });
      await card.getByRole("button", { name: /Aplicar/ }).click();

      await expect(card.getByRole("alert")).toContainText("cambió");
      await expect(card.getByText("Desactualizada")).toBeVisible();
      await expect(editorBody(page).getByText("Cierre editado")).toBeVisible();
    });

    test("replace_selection only replaces the text that was selected", async ({ page }) => {
      await writeArticle(page, "Hola mundo cruel");
      await editorBody(page).getByText("Hola mundo cruel").dblclick();
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+ControlOrMeta+ArrowRight");
      await page.keyboard.press("Shift+ControlOrMeta+ArrowRight");
      let sent: { selection: { blockIds: string[]; text: string } | null } | undefined;
      await page.route("**/api/ai/chat", (route) => {
        sent = route.request().postDataJSON();
        return route.fulfill({
          contentType: "application/x-ndjson",
          body: ndjson(
            { type: "action", action: { op: "replace_selection", markdown: "Chau", label: "Cambiar saludo" } },
            { type: "delta", text: "Listo." },
            { type: "done" },
          ),
        });
      });
      await page.keyboard.press("ControlOrMeta+i");
      await composer(page).fill("Cambiá el saludo");
      await composer(page).press("Enter");

      const card = drawer(page).getByRole("region", { name: "Propuesta: Cambiar saludo" });
      await card.getByRole("button", { name: /Aplicar/ }).click();

      expect(sent?.selection?.blockIds).toEqual(["b0"]);
      await expect(blocksOf(page)).toHaveText(["Chau cruel"]);
    });

    test("apply all runs every pending proposal", async ({ page }) => {
      await writeArticle(page, "Intro");
      await mockAnswer(
        page,
        { type: "action", action: insertAfterIntro },
        { type: "action", action: { op: "append", markdown: "Conclusión final", label: "Agregar conclusión" } },
        { type: "delta", text: "Dos cambios." },
      );
      await ask(page);

      await drawer(page).getByRole("button", { name: /Aplicar todo \(2\)/ }).click();

      await expect(blocksOf(page)).toHaveText(["Intro", "Nueva sección", "Texto agregado.", "Conclusión final"]);
      await expect(drawer(page).getByText("Aplicado")).toHaveCount(2);
    });

    test("the steps of an answer with proposals stay available, collapsed", async ({ page }) => {
      await writeArticle(page, "Intro");
      await mockAnswer(page, { type: "action", action: insertAfterIntro }, { type: "delta", text: "Listo." });
      await ask(page);

      const steps = drawer(page).getByText(/^Pasos \(\d+\)$/);
      await expect(steps).toBeVisible();
      await steps.click();
      await expect(drawer(page).getByText("Leyendo el artículo")).toBeVisible();
    });

    test("plan steps of a multi-change answer are listed once it finishes", async ({ page }) => {
      await writeArticle(page, "Intro");
      await mockAnswer(
        page,
        { type: "step", step: { id: "plan-1", label: "Agregar sección", status: "pending" } },
        { type: "step", step: { id: "plan-2", label: "Agregar conclusión", status: "pending" } },
        { type: "action", action: insertAfterIntro },
        { type: "action", action: { op: "append", markdown: "Conclusión final", label: "Agregar conclusión" } },
        { type: "delta", text: "Dos cambios." },
      );
      await ask(page);

      await drawer(page).getByText(/^Pasos \(\d+\)$/).click();

      await expect(drawer(page).getByText("Agregar sección", { exact: true })).toBeVisible();
      await expect(drawer(page).getByText("Agregar conclusión", { exact: true }).first()).toBeVisible();
    });

    test("two proposals on the same block are flagged and left out of apply all", async ({ page }) => {
      await writeArticle(page, "Intro", "Cierre");
      const replaceCierre = (markdown: string, label: string) => ({ op: "replace_block", blockId: "b1", markdown, label });
      await mockAnswer(
        page,
        { type: "action", action: replaceCierre("Cierre A", "Cierre A") },
        { type: "action", action: replaceCierre("Cierre B", "Cierre B") },
        { type: "action", action: { op: "append", markdown: "Extra", label: "Agregar extra" } },
        { type: "delta", text: "Tres cambios." },
      );
      await ask(page);

      const overlapping = drawer(page).getByRole("region", { name: "Propuesta: Cierre B" });
      await expect(overlapping.getByText("Se superpone", { exact: true })).toBeVisible();

      await drawer(page).getByRole("button", { name: /Aplicar todo \(2\)/ }).click();

      await expect(blocksOf(page)).toHaveText(["Intro", "Cierre A", "Extra"]);
      await expect(overlapping.getByText("Se superpone", { exact: true })).toBeVisible();
    });

    test("insert at cursor with text selected keeps that text and inserts the message", async ({ page }) => {
      await writeArticle(page, "Hola mundo");
      await mockAnswer(page, { type: "delta", text: "AQUÍ" });
      await ask(page);
      await editorBody(page).getByText("Hola mundo").click();
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+ArrowRight");
      await page.keyboard.press("Shift+ArrowRight");
      await page.keyboard.press("Shift+ArrowRight");
      await page.keyboard.press("Shift+ArrowRight");

      await drawer(page).getByRole("button", { name: "Insertar en cursor" }).click();

      await expect(editorBody(page)).toContainText("AQUÍ");
      await expect(editorBody(page)).toContainText("Hola mundo");
    });

    test("a text-only answer offers to insert at the end and, once the editor has a cursor, at the cursor", async ({ page }) => {
      await writeArticle(page, "Intro");
      await mockAnswer(page, { type: "delta", text: "Una conclusión posible." });
      await ask(page);

      await expect(drawer(page).getByText("Pasos")).toHaveCount(0);
      await expect(drawer(page).getByRole("button", { name: "Insertar en cursor" })).toBeVisible();

      await drawer(page).getByRole("button", { name: "Insertar al final" }).click();

      await expect(blocksOf(page)).toHaveText(["Intro", "Una conclusión posible."]);
    });

    test("a manual insert that would exceed the article limit shows an error instead of failing silently", async ({ page }) => {
      await writeArticle(page, "Intro");
      await mockAnswer(page, { type: "delta", text: "x".repeat(100_000) });
      await ask(page);

      await drawer(page).getByRole("button", { name: "Insertar al final" }).click();

      await expect(drawer(page).getByRole("alert")).toContainText("límite");
      await expect(blocksOf(page)).toHaveText(["Intro"]);
    });

    test("the cards fit the drawer without horizontal overflow", async ({ page }) => {
      await writeArticle(page, "Intro");
      await mockAnswer(
        page,
        { type: "action", action: { ...insertAfterIntro, markdown: `## ${"palabralarga".repeat(20)}\n\n${"texto ".repeat(200)}` } },
        { type: "delta", text: "Listo." },
      );
      await ask(page);

      await expect(drawer(page).getByRole("region", { name: "Propuesta: Agregar sección" })).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
    });
  });

  for (const [width, height] of [
    [1280, 720],
    [1024, 768],
    [768, 600],
    [1200, 600],
  ]) {
    test(`no horizontal overflow at ${width}x${height}, drawer closed and open`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await expect(editorBody(page)).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);

      await page.getByRole("button", { name: "Asistente de IA" }).click();
      await expect(drawer(page)).toBeVisible();
      await expect.poll(async () => (await drawer(page).boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(320);
      expect(await noHorizontalOverflow(page)).toBe(true);

      // Composer and privacy note stay reachable inside the viewport at low heights.
      await expect(drawer(page).getByLabel("Mensaje para el asistente")).toBeInViewport();
      await expect(drawer(page).getByRole("note")).toBeInViewport();
    });
  }
});
