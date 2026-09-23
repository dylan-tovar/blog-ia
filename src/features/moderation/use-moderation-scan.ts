"use client";

import { useEffect, useState } from "react";
import { scan, type ModerationSummary } from "./scan";

// Se revisa con rebote, como el autoguardado: el escaneo es barato pero no hace
// falta rehacerlo en cada tecla, y avisar a mitad de una palabra sería ruido.
const DEBOUNCE_MS = 400;

const EMPTY: ModerationSummary = {
  matches: [],
  grave: 0,
  leve: 0,
  blocked: false,
  categories: [],
};

export function useModerationScan(text: string): ModerationSummary {
  const [summary, setSummary] = useState<ModerationSummary>(EMPTY);

  useEffect(() => {
    const timer = setTimeout(() => setSummary(scan(text)), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  return summary;
}
