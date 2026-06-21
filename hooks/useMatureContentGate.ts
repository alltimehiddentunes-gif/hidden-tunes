import { useCallback, useRef, useState } from "react";

import type { MatureContentItem } from "../types/matureContent";
import { isMatureContentItem } from "../types/matureContent";
import { useMatureContentSettings } from "./useMatureContentSettings";

export function useMatureContentGate() {
  const { hasConsent, grantConsent } = useMatureContentSettings();
  const [consentVisible, setConsentVisible] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const runWithMatureConsent = useCallback(
    (item: MatureContentItem | null | undefined, action: () => void) => {
      if (!isMatureContentItem(item)) {
        action();
        return;
      }

      if (hasConsent) {
        action();
        return;
      }

      pendingActionRef.current = action;
      setConsentVisible(true);
    },
    [hasConsent]
  );

  const cancelConsent = useCallback(() => {
    pendingActionRef.current = null;
    setConsentVisible(false);
  }, []);

  const confirmConsent = useCallback(() => {
    void grantConsent().then(() => {
      setConsentVisible(false);
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      action?.();
    });
  }, [grantConsent]);

  return {
    consentVisible,
    runWithMatureConsent,
    cancelConsent,
    confirmConsent,
  };
}
