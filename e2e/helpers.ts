import { expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-123";

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

export async function completeOnboarding(
  page: Page,
  { displayName = "E2E User", username = uniqueUsername() } = {},
) {
  await page.getByLabel("Nombre para mostrar").fill(displayName);
  await page.getByLabel("Nombre de usuario").fill(username);
  await page.getByRole("button", { name: "Continuar" }).click();
  return { username };
}

// Signs up and completes onboarding; ends on the home page.
export async function register(page: Page, displayName = "E2E User") {
  const email = await signUpAccount(page);
  const { username } = await completeOnboarding(page, { displayName });
  await expect(page).toHaveURL(HOME_URL);
  return { email, username };
}

export async function createDraft(page: Page) {
  await page.goto("/posts");
  await page.getByRole("button", { name: "Nuevo post" }).click();
  await expect(page).toHaveURL(/\/editor\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}
