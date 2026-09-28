import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test.describe("app shell", () => {
  test("anonymous visitors see login and register, and no bottom nav or create button", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Iniciar sesión" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Registrarse" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear publicación" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toHaveCount(0);
  });

  test("the header title follows the current page", async ({ page }) => {
    await register(page);
    await expect(page.locator("header").getByText("Inicio")).toBeVisible();
    await page.goto("/posts");
    await expect(page.locator("header").getByText("Mis posts")).toBeVisible();
    await page.goto("/settings");
    await expect(page.locator("header").getByText("Settings")).toBeVisible();
  });

  test("the avatar in the header opens the account menu and settings from there", async ({
    page,
  }) => {
    await register(page);
    await page.getByRole("button", { name: "Menú de cuenta" }).click();
    await page.getByRole("link", { name: "Ajustes" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("creating an article hides the create button inside the editor", async ({ page }) => {
    await register(page);
    await page.getByRole("button", { name: "Crear publicación" }).click();
    await page.getByRole("link", { name: "Artículo" }).click();
    await expect(page).toHaveURL(/\/editor\/new$/);
    await expect(page.getByRole("button", { name: "Crear publicación" })).toHaveCount(0);
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

  test("shows the bottom navigation with the four destinations", async ({ page }) => {
    await register(page);
    const nav = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(nav).toBeVisible();

    const links = nav.getByRole("link");
    await expect(links).toHaveCount(4);
    const labels = await links.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("aria-label")),
    );
    expect(labels).toEqual(["Inicio", "Explorar", "Actividad", "Perfil"]);

    await nav.getByRole("link", { name: "Explorar" }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(nav.getByRole("link", { name: "Explorar" })).toHaveAttribute(
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
