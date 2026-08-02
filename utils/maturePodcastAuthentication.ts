import { requireOptionalNativeModule } from "expo-modules-core";

export type MatureAuthenticationResult =
  | { success: true }
  | {
      success: false;
      reason: "native_module_missing" | "device_security_missing" | "cancelled" | "failed";
    };

export async function authenticateForMaturePodcasts(): Promise<MatureAuthenticationResult> {
  try {
    // Avoid evaluating expo-local-authentication at all in an older client.
    // Metro reports a red native-module error even when a rejected dynamic
    // import is caught, so probe the native registry first.
    if (!requireOptionalNativeModule("ExpoLocalAuthentication")) {
      return { success: false, reason: "native_module_missing" };
    }

    // Load lazily so an older development client that does not yet contain the
    // native module can still start and render every non-mature app surface.
    const LocalAuthentication = await import("expo-local-authentication");

    // SECRET includes an enrolled device credential; biometric levels include
    // supported biometric enrollment. Authentication itself remains OS-owned.
    const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();
    if (enrolledLevel === LocalAuthentication.SecurityLevel.NONE) {
      return { success: false, reason: "device_security_missing" };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Mature Podcasts",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
      biometricsSecurityLevel: "strong",
    });
    if (result.success === true) return { success: true };
    const cancelled = result.error === "user_cancel" || result.error === "system_cancel" ||
      result.error === "app_cancel";
    return { success: false, reason: cancelled ? "cancelled" : "failed" };
  } catch {
    return { success: false, reason: "failed" };
  }
}
