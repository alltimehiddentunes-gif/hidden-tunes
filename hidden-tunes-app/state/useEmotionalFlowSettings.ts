import { useSyncExternalStore } from "react";

import {
  getEmotionalFlowSettings,
  subscribeEmotionalFlowSettings,
} from "./emotionalFlowSettings";

export function useEmotionalFlowSettings() {
  return useSyncExternalStore(
    subscribeEmotionalFlowSettings,
    getEmotionalFlowSettings,
    getEmotionalFlowSettings
  );
}
