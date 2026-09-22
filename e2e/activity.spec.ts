import { expect, test, type Page } from "@playwright/test";
import { createDraft, register } from "./helpers";

async function publishPost(page: Page, title: string) {
  const id = await createDraft(page);
  await page.getByLabel("Título").fill(title);
  await page.getByLabel("Contenido").fill(`Contenido de ${title}`);
  await expect(page.getByText("Guardado")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText("Publicado")).toBeVisible();
  return id;
}

// Follows the author from the global feed (the reader must not follow anyone yet).
async function followAuthorFromHome(page: Page, authorName: string) {
  await page.goto("/");
  await page.getByRole("link", { name: authorName }).first().click();
  await expect(page).toHaveURL(/\/author\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Seguir" }).click();
  await expect(page.getByRole("button", { name: "Dejar de seguir" })).toBeVisible();
}

test.describe("activity", () => {
  // Forces the mobile bottom nav, the only navigation rendered at this width, so
  // the unread badge is unambiguous to locate.
  test.use({ viewport: { width: 360, height: 800 } });

  test("follow, like and a note each notify the owner, and visiting /activity clears the badge", async ({
    page,
    browser,
  }) => {
    const suffix = Date.now();
    const authorName = `Autora ${suffix}`;
    const readerName = `Lectora ${suffix}`;

    await register(page, authorName);
    const postId = await publishPost(page, `Post notificado ${suffix}`);

    const reader = await browser.newPage();
    await register(reader, readerName);

    await followAuthorFromHome(reader, authorName);

    await reader.goto(`/post/${postId}`);
    await reader.getByRole("button", { name: "Me gusta" }).click();
    await expect(reader.getByRole("button", { name: "Quitar me gusta" })).toBeVisible();

    await reader.getByPlaceholder("Dejá una nota sobre este post…").fill(`Nota de ${readerName}`);
    await reader.getByRole("button", { name: "Publicar" }).click();
    await expect(reader.getByText(`Nota de ${readerName}`)).toBeVisible();

    // The author's badge reflects the 3 unread notifications before visiting /activity.
    await page.goto("/");
    const bottomNav = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(bottomNav.getByLabel("3 notificaciones sin leer")).toBeVisible();

    await page.goto("/activity");
    await expect(page.getByText(`${readerName} empezó a seguirte`)).toBeVisible();
    await expect(page.getByText(`${readerName} le dio me gusta a tu post`)).toBeVisible();
    const noteNotification = page.getByText(`${readerName} dejó una nota en tu post`);
    await expect(noteNotification).toBeVisible();

    // The note notification links back to the post that received it.
    await noteNotification.click();
    await expect(page).toHaveURL(new RegExp(`/post/${postId}$`));

    // Revisiting /activity marked everything read: a fresh load shows no badge.
    await page.goto("/");
    await expect(bottomNav.getByLabel(/notificaciones sin leer/)).toHaveCount(0);
  });

  test("unfollowing removes the pending follow notification", async ({ page, browser }) => {
    const suffix = Date.now();
    const authorName = `Autora unfollow ${suffix}`;
    const readerName = `Lectora unfollow ${suffix}`;

    await register(page, authorName);

    const reader = await browser.newPage();
    await register(reader, readerName);
    await followAuthorFromHome(reader, authorName);

    await page.goto("/");
    const bottomNav = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(bottomNav.getByLabel("1 notificaciones sin leer")).toBeVisible();

    await reader.getByRole("button", { name: "Dejar de seguir" }).click();
    await expect(reader.getByRole("button", { name: "Seguir" })).toBeVisible();

    await page.goto("/");
    await expect(bottomNav.getByLabel(/notificaciones sin leer/)).toHaveCount(0);
  });
});
