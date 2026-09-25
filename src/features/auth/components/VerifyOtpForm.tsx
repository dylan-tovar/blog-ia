"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "cn";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  resendPasswordResetOtp,
  resendSignupOtp,
  verifyRecoveryOtp,
  verifySignupOtp,
} from "@/features/auth/actions";

interface VerifyOtpFormProps {
  email: string;
  verifyType?: "signup" | "recovery";
}

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 48;

export function VerifyOtpForm({ email, verifyType = "signup" }: VerifyOtpFormProps) {
  const verifyAction = verifyType === "recovery" ? verifyRecoveryOtp : verifySignupOtp;
  const resendActionFn = verifyType === "recovery" ? resendPasswordResetOtp : resendSignupOtp;
  const [state, action, pending] = useActionState(verifyAction, { email });
  const [resendState, resendAction, resendPending] = useActionState(resendActionFn, undefined);

  const [token, setToken] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  // One interval for the component's whole life instead of one per tick.
  // `Date.now()` can't run during render, so the end time is set in the effect.
  const cooldownEndAt = useRef<number | null>(null);

  useEffect(() => {
    cooldownEndAt.current ??= Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((cooldownEndAt.current! - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  function handleResend() {
    startTransition(() => {
      const formData = new FormData();
      formData.append("email", email);
      resendAction(formData);
      cooldownEndAt.current = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
    });
  }

  const isComplete = token.length === OTP_LENGTH;

  return (
    <div className="flex flex-1 flex-col justify-between">
      <form action={action} className="flex flex-1 flex-col justify-between">
        <input type="hidden" name="email" value={state?.email ?? email} />

        <div>
          <InputOTP
            maxLength={OTP_LENGTH}
            value={token}
            onChange={setToken}
            name="token"
            disabled={pending}
            autoFocus
            containerClassName="justify-center"
          >
            <div
              className="flex w-full items-center gap-2"
              role="group"
              aria-label="Código de verificación"
            >
              {Array.from({ length: OTP_LENGTH }).map((_, index) => (
                <InputOTPGroup key={index} className="rounded-md">
                  <InputOTPSlot
                    index={index}
                    className={cn(
                      "size-12 sm:size-15 rounded-md border-2 border-transparent bg-card text-center text-2xl font-bold text-white transition-all outline-none",
                      "first:rounded-md first:border-2 last:rounded-md last:border-2",
                      "data-[active=true]:border-white data-[active=true]:ring-0 data-[active=true]:z-0"
                    )}
                  />
                </InputOTPGroup>
              ))}
            </div>
          </InputOTP>

          <div className="mt-6 flex items-center">
            {secondsLeft > 0 ? (
              <p className="text-sm text-neutral-400">
                Reenviar código <span className="ml-1 font-semibold text-white">{secondsLeft}s</span>
              </p>
            ) : (
              <button
                type="button"
                disabled={resendPending}
                onClick={handleResend}
                className="text-sm font-medium text-blue-500 hover:text-blue-400 hover:underline cursor-pointer disabled:opacity-50"
              >
                {resendPending && <Loader2 className="mr-1.5 inline size-3.5 animate-spin" />}
                Reenviar código
              </button>
            )}
          </div>

          {resendState?.notice && (
            <p role="status" className="mt-2 text-xs text-success">
              {resendState.notice}
            </p>
          )}
          {resendState?.error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {resendState.error}
            </p>
          )}

          {state?.error && (
            <p role="alert" className="mt-4 text-center text-sm text-destructive">
              {state.error}
            </p>
          )}
        </div>

        <div className="mt-auto pt-10 pb-2">
          <button
            type="submit"
            disabled={pending || !isComplete}
            className={cn(
              "flex h-13 w-full items-center justify-center rounded-md text-base font-semibold transition-all sm:h-14",
              isComplete && !pending
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500 active:scale-[0.99] cursor-pointer"
                : "bg-card text-neutral-500 cursor-not-allowed"
            )}
          >
            {pending && <Loader2 className="mr-2 size-5 animate-spin" />}
            Continuar
          </button>
        </div>
      </form>
    </div>
  );
}
