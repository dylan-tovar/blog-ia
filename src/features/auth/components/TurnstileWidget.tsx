"use client";

import Script from "next/script";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileRenderOptions {
  sitekey: string;
  language?: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export interface TurnstileWidgetHandle {
  reset: () => void;
}

interface TurnstileWidgetProps {
  // Fires with true once Cloudflare issues a token, and with false when the
  // token expires, errors out or is cleared by reset(). Lets a form keep its
  // submit disabled until the challenge is actually solved.
  onVerifiedChange?: (verified: boolean) => void;
}

// Explicit rendering (not the implicit `data-sitekey` auto-scan) because the
// implicit scan only runs once, when api.js finishes loading. A Turnstile
// token is single-use, so callers need to get a fresh one after a failed
// submit — but if we ever remounted this component to force that, the new
// `div.cf-turnstile` would never get picked up (the script already scanned),
// leaving the widget inert until a full page reload. `turnstile.reset()` is
// Cloudflare's documented way to get a new token without remounting.
export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onVerifiedChange }, ref) {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    if (!siteKey) {
      throw new Error("Falta NEXT_PUBLIC_TURNSTILE_SITE_KEY en las variables de entorno.");
    }

    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    // The widget is rendered once, so its callbacks must read the latest prop.
    const onVerifiedChangeRef = useRef(onVerifiedChange);
    useEffect(() => {
      onVerifiedChangeRef.current = onVerifiedChange;
    }, [onVerifiedChange]);

    const renderWidget = () => {
      if (!containerRef.current || widgetIdRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        language: "es",
        callback: () => onVerifiedChangeRef.current?.(true),
        "expired-callback": () => onVerifiedChangeRef.current?.(false),
        "error-callback": () => onVerifiedChangeRef.current?.(false),
      });
    };

    useEffect(() => {
      if (window.turnstile) {
        renderWidget();
      }

      return () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
          onVerifiedChangeRef.current?.(false);
        }
      },
    }));

    return (
      <>
        <Script src={TURNSTILE_SCRIPT_SRC} strategy="afterInteractive" onLoad={renderWidget} />
        <div ref={containerRef} className="flex justify-center" />
      </>
    );
  }
);
