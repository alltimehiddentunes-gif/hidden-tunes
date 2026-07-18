/**
 * Detect whether the current native binary includes ExpoVideo.
 * JS can depend on expo-video before a Preview/dev-client rebuild; without this
 * gate, importing expo-video crashes app startup with "Cannot find native module".
 */
import { requireOptionalNativeModule } from "expo-modules-core";

let cached: boolean | null = null;

export function isExpoVideoNativeAvailable(): boolean {
  if (cached != null) return cached;
  try {
    cached = requireOptionalNativeModule("ExpoVideo") != null;
  } catch {
    cached = false;
  }
  return cached;
}
