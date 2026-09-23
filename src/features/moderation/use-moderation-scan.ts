"use client";

import { useEffect, useState } from "react";
import { scanArticle, summarize, type ModerationSummary } from "./scan";

// Se revisa con rebote, como el autoguardado: el escaneo es barato pero no hace
// falta rehacerlo en cada tecla, y avisar a mitad de una palabra sería ruido.
const DEBOUNCE_MS = 400;

const EMPTY: ModerationSummary = summarize([]);

export function useModerationScan(title: string, content: string): ModerationSummary {
  const [summary, setSummary] = useState<ModerationSummary>(EMPTY);

  useEffect(() => {
    const timer = setTimeout(() => setSummary(scanArticle(title, content)), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [title, content]);

  return summary;
}
