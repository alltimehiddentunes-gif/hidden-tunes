import { useCallback, useRef } from "react";

const DEFAULT_GUARD_MS = 500;

export function useOnboardingPressGuard(guardMs = DEFAULT_GUARD_MS) {
  const lastPressAtRef = useRef(0);

  const guardPress = useCallback(
    (target: string, handler: () => void) => {
      return () => {
        const now = Date.now();
        if (now - lastPressAtRef.current < guardMs) {
          return;
        }

        lastPressAtRef.current = now;
        console.log("[onboarding] button ready", target);
        handler();
      };
    },
    [guardMs]
  );

  return guardPress;
}

export function logOnboardingNavigationReady() {
  const targets = [
    "home",
    "search",
    "explore",
    "genre",
    "mood",
    "recently-added",
  ] as const;

  for (const target of targets) {
    console.log("[onboarding] button ready", target);
  }
}
