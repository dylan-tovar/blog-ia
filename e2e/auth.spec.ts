import { expect, test, type Page } from "@playwright/test";
import {
  HOME_URL,
  INTERESTS_HEADING,
  ONBOARDING_URL,
  PASSWORD,
  completeInterests,
  completeOnboarding,
  interestChips,
  register,
  signUpAccount,
  uniqueEmail,
  uniqueUsername,
} from "./helpers";

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
    "/onboarding",
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
  test("registers a new user, completes both onboarding steps and lands on the feed", async ({
    page,
  }) => {
    await signUpAccount(page);
    await expect(page.getByText("Paso 1 de 2", { exact: true })).toBeVisible();
    await completeOnboarding(page);
    await expect(page).toHaveURL(ONBOARDING_URL);
    await expect(page.getByText("Paso 2 de 2", { exact: true })).toBeVisible();
    await completeInterests(page);
    await expect(page).toHaveURL(HOME_URL);
  });

  test("step 2 keeps the button disabled until 3 topics are selected", async ({ page }) => {
    await signUpAccount(page);
    await completeOnboarding(page);
    await expect(page.getByRole("heading", { name: INTERESTS_HEADING })).toBeVisible();

    const chips = interestChips(page);
    const total = await chips.count();
    test.skip(total < 3, "needs at least 3 tags on published articles in the database");

    const submit = page.getByRole("button", { name: "Continuar" });
    await expect(submit).toBeDisabled();
    await expect(page.getByRole("status")).toContainText("Elegí al menos 3 · 0 elegidos");

    for (const index of [0, 1]) {
      await chips.nth(index).click();
      await expect(chips.nth(index)).toHaveAttribute("aria-pressed", "true");
      await expect(submit).toBeDisabled();
    }
    await expect(page.getByRole("status")).toContainText("Elegí al menos 3 · 2 elegidos");

    await chips.nth(2).click();
    await expect(submit).toBeEnabled();
    await expect(page.getByRole("status")).toHaveText("3 elegidos");

    // A chip can be deselected again, which blocks the submit once more.
    await chips.nth(2).click();
    await expect(chips.nth(2)).toHaveAttribute("aria-pressed", "false");
    await expect(submit).toBeDisabled();
  });

  test("a user who finished step 1 is sent back to step 2 from every page", async ({
    page,
  }) => {
    await signUpAccount(page);
    await completeOnboarding(page);
    await expect(page.getByRole("heading", { name: INTERESTS_HEADING })).toBeVisible();

    for (const path of ["/", "/settings", "/posts"]) {
      await page.goto(path);
      await expect(page).toHaveURL(ONBOARDING_URL);
      await expect(page.getByRole("heading", { name: INTERESTS_HEADING })).toBeVisible();
    }
  });

  test("a user can log out from step 2", async ({ page }) => {
    await signUpAccount(page);
    await completeOnboarding(page);
    await expect(page.getByRole("heading", { name: INTERESTS_HEADING })).toBeVisible();

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("flags mismatched passwords live and blocks the submit", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email").fill(uniqueEmail());
    await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    const confirm = page.getByLabel("Confirmar contraseña");
    await confirm.fill(`${PASSWORD}-x`);

    await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();
    await expect(confirm).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("button", { name: "Crear cuenta" })).toBeDisabled();

    await confirm.fill(PASSWORD);
    await expect(page.getByText("Las contraseñas no coinciden.")).toBeHidden();
    await expect(page.getByText("Las contraseñas coinciden")).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear cuenta" })).toBeEnabled();
  });

  test("ticks the password requirements as they are met", async ({ page }) => {
    await page.goto("/register");
    const password = page.getByLabel("Contraseña", { exact: true });
    const requirements = page.locator("#password-requirements");

    await password.fill("abc");
    await expect(requirements).toContainText("Pendiente: Al menos 8 caracteres");
    await expect(requirements).toContainText("Cumplido: Una minúscula");
    await expect(requirements).toContainText("Pendiente: Una mayúscula");
    await expect(page.getByText("Débil")).toBeVisible();

    await password.fill("Abcdef1!");
    await expect(requirements).not.toContainText("Pendiente");
    await expect(page.getByText("Fuerte")).toBeVisible();
  });

  test("keeps the submit disabled while the password is weak", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email").fill(uniqueEmail());
    await page.getByLabel("Contraseña", { exact: true }).fill("password1");
    await page.getByLabel("Confirmar contraseña").fill("password1");

    await expect(page.getByText("Las contraseñas no coinciden.")).toBeHidden();
    await expect(page.getByRole("button", { name: "Crear cuenta" })).toBeDisabled();
  });

  test("shows and hides the passwords", async ({ page }) => {
    await page.goto("/register");
    const password = page.getByLabel("Contraseña", { exact: true });
    await expect(password).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Mostrar contraseña" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Ocultar contraseña" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("a user without a profile is sent to step 1 from a protected page", async ({
    page,
  }) => {
    await signUpAccount(page);
    for (const path of ["/", "/settings", "/posts"]) {
      await page.goto(path);
      await expect(page).toHaveURL(ONBOARDING_URL);
    }
  });

  test("a fully onboarded user is bounced from /onboarding to the feed", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(HOME_URL);
  });

  test("a user without a profile can log out from /onboarding", async ({ page }) => {
    await signUpAccount(page);
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/login$/);
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
    await other.getByLabel("Email").fill(email);
    await other.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await other.getByLabel("Confirmar contraseña").fill(PASSWORD);
    await other.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(
      other.getByText("Ya existe una cuenta con este email."),
    ).toBeVisible();
    await other.close();
  });

  test("duplicate username shows a friendly error at onboarding", async ({
    page,
    browser,
  }) => {
    const { username } = await register(page);
    const other = await browser.newPage();
    await signUpAccount(other);
    await completeOnboarding(other, { username: username.toUpperCase() });
    await expect(
      other.getByText("Ese nombre de usuario ya está en uso."),
    ).toBeVisible();
    await expect(other).toHaveURL(ONBOARDING_URL);
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
