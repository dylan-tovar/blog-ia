"use client";

import { Button } from "@/components/ui/button";
import { describeAiError, type ClientAiError } from "./ai-ui";
import { useCountdown } from "./use-countdown";

const NO_RETRY: ClientAiError["kind"][] = ["not_allowed", "not_configured", "unauthenticated", "aborted"];

interface AiErrorMessageProps {
  error: ClientAiError;
  onRetry?: () => void;
  disabled?: boolean;
}

// Announcements come from the polite live region every AI container already provides
// (ScorePanel, TitleSuggestions, ToneCompareDialog, OutlineDialog); this component adds none.
// Mount with a `key` per error so the countdown restarts for every new rate-limit response.
export function AiErrorMessage({ error, onRetry, disabled = false }: AiErrorMessageProps) {
  const { secondsLeft, counting } = useCountdown(error.retryAfter ?? 0);

  const message = describeAiError(error, error.kind === "rate_limited" ? secondsLeft : undefined);
  if (!message) {
    return null;
  }

  return (
    <div className="flex flex-col items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      <p>{message}</p>
      {onRetry && !NO_RETRY.includes(error.kind) && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onRetry}
          disabled={disabled || counting}
        >
          Reintentar
        </Button>
      )}
    </div>
  );
}
