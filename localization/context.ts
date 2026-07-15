import { createContext, useContext } from "react";

import type { LocalizationContextValue } from "./types";

export const LocalizationContext = createContext<LocalizationContextValue | null>(
  null
);

export function useLocalization(): LocalizationContextValue {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error("useLocalization must be used within LocalizationProvider");
  }
  return context;
}

/** Safe hook for optional localization (returns null outside provider). */
export function useLocalizationOptional(): LocalizationContextValue | null {
  return useContext(LocalizationContext);
}
