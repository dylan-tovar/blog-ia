import { expect, type Page } from "@playwright/test";

export const PASSWORD = "E2e-Password-123!";

// The feed is the home page: "/" with an optional query string.
export const HOME_URL = /^https?:\/\/[^/]+\/(\?.*)?$/;

export const ONBOARDING_URL = /\/onboarding$/;

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

// 3-20 chars, lowercase letters/digits only: fits usernameSchema.
export function uniqueUsername() {
  return `u${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
}

// Signs up with email + password only; ends on /onboarding.
export async function signUpAccount(page: Page, email = uniqueEmail()) {
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(ONBOARDING_URL);
  return email;
}

// Step 1 of onboarding (name + username); ends on step 2.
export async function completeOnboarding(
  page: Page,
  { displayName = "E2E User", username = uniqueUsername() } = {},
) {
  await page.getByLabel("Nombre para mostrar").fill(displayName);
  await page.getByLabel("Nombre de usuario").fill(username);
  await page.getByRole("button", { name: "Continuar" }).click();
  return { username };
}

export const INTERESTS_HEADING = "Elegí tus temas de interés";

export function interestChips(page: Page) {
  return page.getByRole("group", { name: "Temas de interés" }).getByRole("button");
}

// Step 2 of onboarding: picks up to 3 chips (as many as exist when there are fewer)
// and continues. Ends on the home page.
export async function completeInterests(page: Page) {
  await expect(page.getByRole("heading", { name: INTERESTS_HEADING })).toBeVisible();

  const chips = interestChips(page);
  const total = await chips.count();

  for (let index = 0; index < Math.min(3, total); index++) {
    const chip = chips.nth(index);
    // Retried as a whole (and never toggled twice) in case the click lands before hydration.
    await expect(async () => {
      if ((await chip.getAttribute("aria-pressed")) !== "true") {
        await chip.click();
      }
      await expect(chip).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
    }).toPass();
  }

  await page.getByRole("button", { name: "Continuar" }).click();
}

// Signs up and completes both onboarding steps; ends on the home page.
export async function register(page: Page, displayName = "E2E User") {
  const email = await signUpAccount(page);
  const { username } = await completeOnboarding(page, { displayName });
  await completeInterests(page);
  await expect(page).toHaveURL(HOME_URL);
  return { email, username };
}

export async function createDraft(page: Page) {
  await page.goto("/posts");
  await page.getByRole("button", { name: "Nuevo post" }).click();
  await expect(page).toHaveURL(/\/editor\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}
