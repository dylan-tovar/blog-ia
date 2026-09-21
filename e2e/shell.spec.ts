import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test.describe("app shell", () => {
  test("anonymous visitors see login and register, and no bottom nav or + button", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Iniciar sesión" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Registrarse" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuevo post" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toHaveCount(0);
  });

  test("the header title follows the current page", async ({ page }) => {
    await register(page);
    await expect(page.locator("header").getByText("Inicio")).toBeVisible();
    await page.goto("/posts");
    await expect(page.locator("header").getByText("Mis posts")).toBeVisible();
    await page.goto("/settings");
    await expect(page.locator("header").getByText("Tu perfil")).toBeVisible();
  });

  test("the avatar in the header opens the profile", async ({ page }) => {
    await register(page);
    await page.getByRole("link", { name: "Tu perfil" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("the + button creates a draft and is hidden inside the editor", async ({ page }) => {
    await register(page);
    await page.getByRole("button", { name: "Nuevo post" }).click();
    await expect(page).toHaveURL(/\/editor\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("button", { name: "Nuevo post" })).toHaveCount(0);
  });

  test("login and register pages have no app navigation", async ({ page }) => {
    for (const path of ["/login", "/register"]) {
      await page.goto(path);
      await expect(page.locator("header")).toHaveCount(0);
    }
  });
});

test.describe("app shell on a phone", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("shows the bottom navigation with the three destinations", async ({ page }) => {
    await register(page);
    const nav = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link")).toHaveText(["Inicio", "Mis posts", "Perfil"]);

    await nav.getByRole("link", { name: "Mis posts" }).click();
    await expect(page).toHaveURL(/\/posts$/);
    await expect(nav.getByRole("link", { name: "Mis posts" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("does not overflow horizontally", async ({ page }) => {
    await register(page);
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});

test.describe("app shell on desktop", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("hides the bottom navigation and shows inline links", async ({ page }) => {
    await register(page);
    await expect(
      page.getByRole("navigation", { name: "Navegación principal" }),
    ).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible();
  });
});
