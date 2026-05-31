import { useSyncExternalStore } from "react";

import {
  getEmotionalDebugEnabled,
  subscribeEmotionalDebugMode,
} from "./emotionalDebugMode";

export function useEmotionalDebugMode() {
  return useSyncExternalStore(
    subscribeEmotionalDebugMode,
    getEmotionalDebugEnabled,
    getEmotionalDebugEnabled
  );
}
