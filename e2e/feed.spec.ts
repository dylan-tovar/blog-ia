import { expect, test, type Page } from "@playwright/test";
import { createDraft, HOME_URL, register } from "./helpers";

const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000000";

async function publishPost(page: Page, title: string, tag: string) {
  const id = await createDraft(page);
  await page.getByLabel("Título").fill(title);
  await page.getByLabel("Contenido").fill(`Contenido de ${title}`);
  await expect(page.getByText("Guardado")).toBeVisible({ timeout: 10_000 });
  await page.getByPlaceholder("Agregar tag").fill(tag);
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText(tag, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText("Publicado")).toBeVisible();
  return id;
}

test.describe("feed", () => {
  test("lives at the root and /feed no longer exists", async ({ page }) => {
    expect((await page.goto("/"))?.status()).toBe(200);
    await expect(page.locator("header")).toBeVisible();
    expect((await page.goto("/feed"))?.status()).toBe(404);
  });

  test("signed-in users land on the feed too", async ({ page }) => {
    await register(page);
    await expect(page).toHaveURL(HOME_URL);
    await expect(page.getByRole("link", { name: "Tu perfil" })).toBeVisible();
  });

  test("is public and tolerates any tag filter", async ({ page }) => {
    expect((await page.goto("/"))?.status()).toBe(200);
    expect((await page.goto("/?tag=zzz-no-existe"))?.status()).toBe(200);
    expect((await page.goto("/?tag="))?.status()).toBe(200);
  });

  test("shows published posts and the tag filter narrows the list", async ({ page }) => {
    const suffix = Date.now();
    const tag = `e2e-${suffix}`;
    await register(page);
    await publishPost(page, `Post con tag ${suffix}`, tag);

    await page.goto("/");
    await expect(page.getByText(`Post con tag ${suffix}`)).toBeVisible();

    await page.goto(`/?tag=${tag}`);
    await expect(page.getByText(`Post con tag ${suffix}`)).toBeVisible();

    await page.goto(`/?tag=${tag}-otro`);
    await expect(page.getByText("No hay posts publicados con ese tag.")).toBeVisible();
  });

  test("tags are stored but never shown to readers", async ({ page, browser }) => {
    const suffix = Date.now();
    const tag = `oculto-${suffix}`;
    await register(page);
    const id = await publishPost(page, `Post sin tags visibles ${suffix}`, tag);

    const reader = await browser.newPage();
    await reader.goto("/");
    await expect(reader.getByText(`Post sin tags visibles ${suffix}`)).toBeVisible();
    await expect(reader.getByText(tag)).toHaveCount(0);
    await expect(reader.locator("a[href*='tag=']")).toHaveCount(0);

    await reader.goto(`/post/${id}`);
    await expect(reader.getByRole("heading", { name: `Post sin tags visibles ${suffix}` })).toBeVisible();
    await expect(reader.getByText(tag)).toHaveCount(0);
    await expect(reader.locator("a[href*='tag=']")).toHaveCount(0);

    // Still stored: the author sees it in the editor, and the URL filter finds the post.
    await page.goto(`/editor/${id}`);
    await expect(page.getByText(tag, { exact: true })).toBeVisible();
    await reader.goto(`/?tag=${tag}`);
    await expect(reader.getByText(`Post sin tags visibles ${suffix}`)).toBeVisible();
    await reader.close();
  });

  test("drafts never appear in the feed", async ({ page }) => {
    const title = `Borrador ${Date.now()}`;
    await register(page);
    await createDraft(page);
    await page.getByLabel("Título").fill(title);
    await expect(page.getByText("Guardado")).toBeVisible({ timeout: 10_000 });

    await page.goto("/");
    await expect(page.getByText(title)).toHaveCount(0);
  });
});

test.describe("author page and follow", () => {
  test("invalid or unknown author ids are 404", async ({ page }) => {
    expect((await page.goto("/author/not-a-uuid"))?.status()).toBe(404);
    expect((await page.goto(`/author/${UNKNOWN_UUID}`))?.status()).toBe(404);
  });

  test("a reader follows and unfollows an author", async ({ page, browser }) => {
    const suffix = Date.now();
    await register(page, "Autor E2E");
    await publishPost(page, `Post autor ${suffix}`, `e2e-${suffix}`);

    const reader = await browser.newPage();
    await register(reader, "Lector E2E");
    await reader.goto("/");
    await reader.getByRole("link", { name: "Autor E2E" }).first().click();
    await expect(reader).toHaveURL(/\/author\/[0-9a-f-]{36}$/);

    await reader.getByRole("button", { name: "Seguir" }).click();
    await expect(reader.getByRole("button", { name: "Dejar de seguir" })).toBeVisible();
    await expect(reader.getByText("1 seguidor")).toBeVisible();

    await reader.reload();
    await expect(reader.getByRole("button", { name: "Dejar de seguir" })).toBeVisible();

    await reader.getByRole("button", { name: "Dejar de seguir" }).click();
    await expect(reader.getByRole("button", { name: "Seguir" })).toBeVisible();
    await expect(reader.getByText("0 seguidores")).toBeVisible();
    await reader.close();
  });

  test("an author has no follow button on their own page", async ({ page }) => {
    const suffix = Date.now();
    await register(page, "Autor Propio");
    await publishPost(page, `Post propio ${suffix}`, `e2e-${suffix}`);

    await page.goto("/");
    await page.getByRole("link", { name: "Autor Propio" }).first().click();
    await expect(page.getByRole("heading", { name: "Autor Propio" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Seguir" })).toHaveCount(0);
  });

  test("anonymous visitors get a login link instead of a follow button", async ({
    page,
    browser,
  }) => {
    const suffix = Date.now();
    await register(page, "Autor Anonimo");
    await publishPost(page, `Post anon ${suffix}`, `e2e-${suffix}`);

    const anonymous = await browser.newPage();
    await anonymous.goto("/");
    await anonymous.getByRole("link", { name: "Autor Anonimo" }).first().click();
    await anonymous.getByRole("link", { name: "Seguir" }).click();
    await expect(anonymous).toHaveURL(/\/login$/);
    await anonymous.close();
  });
});
