import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

export const PASSWORD = "E2e-Password-123!";

// The feed is the home page: "/" with an optional query string.
export const HOME_URL = /^https?:\/\/[^/]+\/(\?.*)?$/;

export const ONBOARDING_URL = /\/onboarding$/;

export const VERIFY_URL = /\/verify(\?.*)?$/;

// A domain with real MX records: Supabase's public signup rejects domains without one
// (e.g. @example.com), regardless of whether the mailbox actually exists.
export function uniqueEmail(prefix = "e2e") {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@gmail.com`;
}

// 3-20 chars, lowercase letters/digits only: fits usernameSchema.
export function uniqueUsername() {
  return `u${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta ${name} en .env.local (necesaria para los helpers de e2e).`);
  }
  return value;
}

// Lazy: only built the first time a helper needs the admin API, so specs that never
// register a user don't require SUPABASE_SECRET_KEY to be set.
let admin: ReturnType<typeof createClient> | undefined;
function adminClient() {
  admin ??= createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return admin;
}

// The real /register form already created the (unconfirmed) user; there's no real inbox
// to read the code from, so this re-issues a fresh signup OTP through the admin API instead.
async function getSignupOtp(email: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: "signup",
    email,
    password: PASSWORD,
  });
  const otp = data?.properties?.email_otp;
  if (error || !otp) {
    throw new Error(
      `No pude obtener el código OTP de registro para ${email}: ${error?.message ?? "sin email_otp en la respuesta"}`,
    );
  }
  return otp;
}

// Signs up with email + password, verifies the OTP sent to /verify and ends on /onboarding.
export async function signUpAccount(page: Page, email = uniqueEmail()) {
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(VERIFY_URL);

  const otp = await getSignupOtp(email);
  await page.locator('input[data-slot="input-otp"]').pressSequentially(otp);
  await page.getByRole("button", { name: "Continuar" }).click();

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

// Creates a draft from /posts and returns its id. The row has no id until autosave
// fires (use-autosave.ts swaps the URL from /editor/new to /editor/<uuid> once it does).
export async function createDraft(page: Page) {
  await page.goto("/posts");
  await page.getByRole("link", { name: "Nuevo artículo" }).click();
  await expect(page).toHaveURL(/\/editor\/new$/);
  await page.getByLabel("Título").fill("Borrador e2e");
  await expect(page).toHaveURL(/\/editor\/[0-9a-f-]{36}$/, { timeout: 10_000 });
  return page.url().split("/").pop()!;
}
