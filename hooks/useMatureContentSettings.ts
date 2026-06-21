import { useCallback, useSyncExternalStore } from "react";

import {
  disableMatureContent,
  enableMatureContentWithConsent,
  getMatureContentSettings,
  grantMatureContentConsent,
  hydrateMatureContentSettings,
  subscribeMatureContentSettings,
} from "../utils/matureContentSettings";

export function useMatureContentSettings() {
  const snapshot = useSyncExternalStore(
    subscribeMatureContentSettings,
    getMatureContentSettings,
    getMatureContentSettings
  );

  const refresh = useCallback(async () => {
    await hydrateMatureContentSettings();
  }, []);

  const enableWithConsent = useCallback(async () => {
    await enableMatureContentWithConsent();
  }, []);

  const grantConsent = useCallback(async () => {
    await grantMatureContentConsent();
  }, []);

  const disable = useCallback(async () => {
    await disableMatureContent();
  }, []);

  return {
    enabled: snapshot.enabled,
    hasConsent: snapshot.hasConsent,
    consentAt: snapshot.consentAt,
    includeMatureInApi: snapshot.enabled && snapshot.hasConsent,
    refresh,
    enableWithConsent,
    grantConsent,
    disable,
  };
}
