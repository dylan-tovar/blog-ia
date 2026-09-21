import { expect, test, type Page } from "@playwright/test";
import { HOME_URL, PASSWORD, register, uniqueEmail, uniqueUsername } from "./helpers";

const IDENTIFIER_LABEL = "Email o usuario";

async function logout(page: Page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

async function login(page: Page, identifier: string, password: string) {
  await page.getByLabel(IDENTIFIER_LABEL).fill(identifier);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
}

test.describe("route protection", () => {
  for (const path of [
    "/settings",
    "/posts",
    "/editor/3f2b8c1e-6a4d-4f1b-9c7e-2d5a8b0e1f34",
  ]) {
    test(`anonymous user is redirected from ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test("the home page (feed) is public", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
  });
});

test.describe("auth flows", () => {
  test("registers a new user and lands on the feed", async ({ page }) => {
    await register(page);
    await expect(page).toHaveURL(HOME_URL);
  });

  test("rejects a wrong password with a generic message", async ({ page }) => {
    const { email } = await register(page);
    await logout(page);

    await login(page, email, "wrong-password");
    await expect(page.getByText("Credenciales inválidas.")).toBeVisible();
  });

  test("logs in with the email", async ({ page }) => {
    const { email } = await register(page);
    await logout(page);

    await login(page, email, PASSWORD);
    await expect(page).toHaveURL(HOME_URL);
  });

  test("logs in with the username", async ({ page }) => {
    const { username } = await register(page);
    await logout(page);

    await login(page, username, PASSWORD);
    await expect(page).toHaveURL(HOME_URL);
  });

  test("username login ignores letter case", async ({ page }) => {
    const { username } = await register(page);
    await logout(page);

    await login(page, username.toUpperCase(), PASSWORD);
    await expect(page).toHaveURL(HOME_URL);
  });

  test("a wrong password for a username gives the same generic error", async ({
    page,
  }) => {
    const { username } = await register(page);
    await logout(page);

    await login(page, username, "wrong-password");
    await expect(page.getByText("Credenciales inválidas.")).toBeVisible();
  });

  test("an unknown username gives the same generic error", async ({ page }) => {
    await page.goto("/login");
    await login(page, uniqueUsername(), PASSWORD);
    await expect(page.getByText("Credenciales inválidas.")).toBeVisible();
  });

  test("logging out re-protects private routes", async ({ page }) => {
    await register(page);
    await logout(page);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("updates the display name and username", async ({ page }) => {
    await register(page);
    await page.goto("/settings");
    await page.getByLabel("Nombre para mostrar").fill("Nuevo Nombre");
    await page.getByLabel("Nombre de usuario").fill(uniqueUsername());
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Perfil actualizado.")).toBeVisible();
  });

  test("the new username works for login after changing it", async ({ page }) => {
    await register(page);
    const renamed = uniqueUsername();
    await page.goto("/settings");
    await page.getByLabel("Nombre de usuario").fill(renamed);
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Perfil actualizado.")).toBeVisible();
    await logout(page);

    await login(page, renamed, PASSWORD);
    await expect(page).toHaveURL(HOME_URL);
  });

  test("duplicate email shows a friendly error", async ({ page, browser }) => {
    const { email } = await register(page);
    const other = await browser.newPage();
    await other.goto("/register");
    await other.getByLabel("Nombre para mostrar").fill("Dup");
    await other.getByLabel("Nombre de usuario").fill(uniqueUsername());
    await other.getByLabel("Email").fill(email);
    await other.getByLabel("Contraseña").fill(PASSWORD);
    await other.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(
      other.getByText("Ya existe una cuenta con este email."),
    ).toBeVisible();
    await other.close();
  });

  test("duplicate username shows a friendly error", async ({ page, browser }) => {
    const { username } = await register(page);
    const other = await browser.newPage();
    await other.goto("/register");
    await other.getByLabel("Nombre para mostrar").fill("Dup");
    await other.getByLabel("Nombre de usuario").fill(username.toUpperCase());
    await other.getByLabel("Email").fill(uniqueEmail());
    await other.getByLabel("Contraseña").fill(PASSWORD);
    await other.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(
      other.getByText("Ese nombre de usuario ya está en uso."),
    ).toBeVisible();
    await other.close();
  });

  test("taking someone else's username in settings shows a friendly error", async ({
    page,
    browser,
  }) => {
    const { username } = await register(page);
    const other = await browser.newPage();
    await register(other);
    await other.goto("/settings");
    await other.getByLabel("Nombre de usuario").fill(username);
    await other.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(
      other.getByText("Ese nombre de usuario ya está en uso."),
    ).toBeVisible();
    await other.close();
  });
});
