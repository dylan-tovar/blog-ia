import { expect, test } from "@playwright/test";
import { createDraft, register } from "./helpers";

test.describe("posts", () => {
  test("creates a draft, autosaves and reflects it in the list", async ({ page }) => {
    await register(page);
    await createDraft(page);

    await page.getByLabel("Título").fill("Mi primer post");
    await page.getByLabel("Contenido").fill("Hola mundo");
    await expect(page.getByText("Guardado")).toBeVisible({ timeout: 10_000 });

    await page.goto("/posts");
    await expect(page.getByText("Mi primer post")).toBeVisible();
    await expect(page.getByText("Borrador")).toBeVisible();
  });

  test("tags are added, listed and not duplicated", async ({ page }) => {
    await register(page);
    await createDraft(page);

    const input = page.getByPlaceholder("Agregar tag");
    for (const name of ["TypeScript", "typescript"]) {
      await input.fill(name);
      await page.getByRole("button", { name: "Agregar" }).click();
    }

    await expect(page.getByText("typescript", { exact: true })).toHaveCount(1);
  });

  test("a tag created by another user can be reused", async ({ page, browser }) => {
    const tag = `compartido-${Date.now()}`;

    await register(page);
    await createDraft(page);
    await page.getByPlaceholder("Agregar tag").fill(tag);
    await page.getByRole("button", { name: "Agregar" }).click();
    await expect(page.getByText(tag, { exact: true })).toBeVisible();

    const other = await browser.newPage();
    await register(other, "Otro Usuario");
    await createDraft(other);
    await other.getByPlaceholder("Agregar tag").fill(tag);
    await other.getByRole("button", { name: "Agregar" }).click();
    await expect(other.getByText(tag, { exact: true })).toBeVisible();
    await other.close();
  });

  test("publishing an empty post shows an error", async ({ page }) => {
    await register(page);
    await createDraft(page);
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect(
      page.getByText("El post no puede estar vacío para publicarlo."),
    ).toBeVisible();
  });

  test("publishing makes the post public", async ({ page }) => {
    await register(page);
    const id = await createDraft(page);
    await page.getByLabel("Contenido").fill("Contenido listo");
    await expect(page.getByText("Guardado")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect(page.getByText("Publicado")).toBeVisible();

    const response = await page.goto(`/post/${id}`);
    expect(response?.status()).toBe(200);
  });

  test("a non-published post is 404 on the public page", async ({ page }) => {
    await register(page);
    const id = await createDraft(page);
    const response = await page.goto(`/post/${id}`);
    expect(response?.status()).toBe(404);
  });

  test("a non-UUID post id is 404 on the public page", async ({ page }) => {
    const response = await page.goto("/post/not-a-uuid");
    expect(response?.status()).toBe(404);
  });

  test("another user cannot open someone else's draft", async ({ page, browser }) => {
    await register(page);
    const id = await createDraft(page);

    const intruder = await browser.newPage();
    await register(intruder, "Intruder");
    const response = await intruder.goto(`/editor/${id}`);
    expect(response?.status()).toBe(404);
    await intruder.close();
  });
});
