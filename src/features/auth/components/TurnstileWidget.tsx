"use client";

import Script from "next/script";

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

export function TurnstileWidget() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    throw new Error("Falta NEXT_PUBLIC_TURNSTILE_SITE_KEY en las variables de entorno.");
  }

  return (
    <>
      <Script src={TURNSTILE_SCRIPT_SRC} strategy="afterInteractive" async defer />
      <div className="cf-turnstile" data-sitekey={siteKey} data-language="es" />
    </>
  );
}
