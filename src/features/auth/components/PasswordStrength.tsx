"use client";

import { Check, Circle } from "lucide-react";
import {
  PASSWORD_MAX_LENGTH_MESSAGE,
  PASSWORD_RULES,
  getPasswordStrength,
  isWithinMaxLength,
  type PasswordStrengthLevel,
} from "@/features/auth/password-rules";
import { cn } from "cn";

const LEVEL_LABEL: Record<PasswordStrengthLevel, string> = {
  empty: "",
  weak: "Débil",
  medium: "Media",
  strong: "Fuerte",
};

const LEVEL_FILL: Record<PasswordStrengthLevel, string> = {
  empty: "bg-muted",
  weak: "bg-destructive",
  medium: "bg-warning",
  strong: "bg-success",
};

const LEVEL_TEXT: Record<PasswordStrengthLevel, string> = {
  empty: "text-muted-foreground",
  weak: "text-destructive",
  medium: "text-warning",
  strong: "text-success",
};

const SEGMENTS = 4;

type PasswordStrengthProps = {
  password: string;
  /** Id for the checklist, so the input can reference it with aria-describedby. */
  requirementsId: string;
};

// Expands while the field has content, or while focus is inside the enclosing
// `group/password` wrapper (RegisterForm wraps the field and this component).
export function PasswordStrength({ password, requirementsId }: PasswordStrengthProps) {
  const { passed, level } = getPasswordStrength(password);
  // 1-2 rules -> 1 segment, then one more per rule (3 -> 2, 4 -> 3, 5 -> 4).
  const filled = level === "empty" ? 0 : passed <= 2 ? 1 : passed - 1;
  const tooLong = !isWithinMaxLength(password);

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
        password
          ? "grid-rows-[1fr] opacity-100"
          : "grid-rows-[0fr] opacity-0 group-focus-within/password:grid-rows-[1fr] group-focus-within/password:opacity-100",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-3">
            <div aria-hidden="true" className="flex flex-1 gap-1">
              {Array.from({ length: SEGMENTS }, (_, i) => (
                <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full origin-left rounded-full transition-[scale,background-color] duration-300 ease-out motion-reduce:transition-none",
                      LEVEL_FILL[level],
                      i < filled ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </div>
              ))}
            </div>
            {/* The text only changes when the level does, so screen readers
                are not interrupted on every keystroke. */}
            <p
              aria-live="polite"
              className={cn(
                "min-w-12 text-right text-xs font-medium transition-colors motion-reduce:transition-none",
                LEVEL_TEXT[level],
              )}
            >
              {level !== "empty" && <span className="sr-only">Fortaleza: </span>}
              {LEVEL_LABEL[level]}
            </p>
          </div>
          <ul id={requirementsId} className="flex flex-col gap-1">
            {PASSWORD_RULES.map((rule) => {
              const ok = rule.test(password);
              return (
                <li
                  key={rule.id}
                  className={cn(
                    "flex items-center gap-2 text-sm transition-colors duration-200 motion-reduce:transition-none",
                    ok ? "text-success" : "text-muted-foreground",
                  )}
                >
                  {ok ? (
                    <Check
                      aria-hidden="true"
                      className="size-4 shrink-0 animate-in duration-200 zoom-in-50 motion-reduce:animate-none"
                    />
                  ) : (
                    <Circle aria-hidden="true" className="size-4 shrink-0" />
                  )}
                  <span className="sr-only">{ok ? "Cumplido: " : "Pendiente: "}</span>
                  {rule.label}
                </li>
              );
            })}
          </ul>
          {tooLong && (
            <p role="alert" className="text-sm text-destructive">
              {PASSWORD_MAX_LENGTH_MESSAGE}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
