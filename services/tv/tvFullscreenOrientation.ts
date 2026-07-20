/**
 * Single owner for TV UI-fullscreen orientation requests.
 *
 * Crash-proof for the current iOS development binary that lacks the native
 * ExpoScreenOrientation module. Never top-level-imports expo-screen-orientation
 * (its entry calls requireNativeModule and throws). Probes with
 * requireOptionalNativeModule first; missing module is cached as unsupported.
 *
 * Landscape lock works only after a new iOS build includes the native module
 * and non-portrait-only orientation masks. Portrait UI fullscreen remains usable.
 */

/**
 * Matches expo-screen-orientation OrientationLock enum values.
 * Verified against installed package types (ScreenOrientation.types.d.ts).
 */
const OrientationLock = {
  PORTRAIT_UP: 3,
  LANDSCAPE: 5,
} as const;

type NativeExpoScreenOrientation = {
  lockAsync?: (orientationLock: number) => Promise<void>;
};

export type TvOrientationResult =
  | { supported: true; applied: boolean; reason?: "already_requested" | "already_restored" }
  | {
      supported: false;
      applied: false;
      reason: "native-module-missing" | "request-failed";
    };

type CapabilityLoader = () => NativeExpoScreenOrientation | null;

/** Tracks whether we currently own a landscape lock for TV fullscreen. */
let fullscreenOrientationActive = false;
let landscapeRequestInFlight = false;
let portraitRestoreInFlight = false;

/** Once true, never attempt native load/import again this JS session. */
let nativeModuleMissingCached = false;
let cachedNative: NativeExpoScreenOrientation | null | undefined;
let warnedMissingOnce = false;

/** Test seam — inject fake native capability without loading expo-screen-orientation. */
let capabilityLoaderOverride: CapabilityLoader | null = null;

export function classifyTvOrientationLoadError(
  error: unknown
): "native-module-missing" | "request-failed" {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/Cannot find native module ['"]?ExpoScreenOrientation['"]?/i.test(message)) {
    return "native-module-missing";
  }
  if (/ExpoScreenOrientation/i.test(message) && /Cannot find native module/i.test(message)) {
    return "native-module-missing";
  }
  return "request-failed";
}

function warnMissingOnce() {
  if (warnedMissingOnce) return;
  warnedMissingOnce = true;
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn(
      "[HTTvOrientation] ExpoScreenOrientation native module missing — portrait fullscreen only until new iOS build"
    );
  }
}

function warnDev(message: string, detail?: unknown) {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    if (detail !== undefined) {
      console.warn(`[HTTvOrientation] ${message}`, detail);
    } else {
      console.warn(`[HTTvOrientation] ${message}`);
    }
  }
}

/**
 * Lazy optional-native probe. Avoids top-level expo-modules-core import so Node
 * contract tests do not pull react-native. Never requires expo-screen-orientation
 * (that package throws via requireNativeModule when native is absent).
 */
function probeOptionalNativeModule(): NativeExpoScreenOrientation | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require("expo-modules-core") as {
      requireOptionalNativeModule?: <T>(moduleName: string) => T | null;
    };
    if (typeof core.requireOptionalNativeModule !== "function") {
      return null;
    }
    return core.requireOptionalNativeModule<NativeExpoScreenOrientation>(
      "ExpoScreenOrientation"
    );
  } catch (error) {
    if (classifyTvOrientationLoadError(error) === "native-module-missing") {
      return null;
    }
    return null;
  }
}

/**
 * Safe native capability probe. Never requires expo-screen-orientation JS entry.
 */
function loadNativeOrientationModule(): NativeExpoScreenOrientation | null {
  if (nativeModuleMissingCached) {
    return null;
  }
  if (capabilityLoaderOverride) {
    try {
      const overridden = capabilityLoaderOverride();
      if (!overridden) {
        nativeModuleMissingCached = true;
        cachedNative = null;
        warnMissingOnce();
      }
      return overridden;
    } catch (error) {
      const classified = classifyTvOrientationLoadError(error);
      nativeModuleMissingCached = true;
      cachedNative = null;
      if (classified === "native-module-missing") {
        warnMissingOnce();
      }
      return null;
    }
  }
  if (cachedNative !== undefined) {
    return cachedNative;
  }

  try {
    const native = probeOptionalNativeModule();
    if (!native || typeof native.lockAsync !== "function") {
      nativeModuleMissingCached = true;
      cachedNative = null;
      warnMissingOnce();
      return null;
    }
    cachedNative = native;
    return native;
  } catch (error) {
    const classified = classifyTvOrientationLoadError(error);
    nativeModuleMissingCached = true;
    cachedNative = null;
    if (classified === "native-module-missing") {
      warnMissingOnce();
    } else {
      warnDev("orientation capability probe failed", error);
    }
    return null;
  }
}

/** True when the npm package is installed (does not prove the native binary linked it). */
export function isTvOrientationPackagePresent(): boolean {
  try {
    // Side-effect-free package.json require — does not load ExpoScreenOrientation.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("expo-screen-orientation/package.json");
    return true;
  } catch {
    return false;
  }
}

/** Synchronous: native module present in this binary (after optional probe). */
export function isTvOrientationNativeSupported(): boolean {
  return loadNativeOrientationModule() != null;
}

/**
 * Request landscape once per fullscreen entry.
 * Missing native module → unsupported (no throw). UI fullscreen stays in portrait.
 */
export async function requestTvFullscreenLandscape(): Promise<TvOrientationResult> {
  try {
    if (fullscreenOrientationActive) {
      return { supported: true, applied: false, reason: "already_requested" };
    }
    if (landscapeRequestInFlight) {
      return { supported: true, applied: false, reason: "already_requested" };
    }
    if (nativeModuleMissingCached) {
      return {
        supported: false,
        applied: false,
        reason: "native-module-missing",
      };
    }

    const native = loadNativeOrientationModule();
    if (!native?.lockAsync) {
      return {
        supported: false,
        applied: false,
        reason: "native-module-missing",
      };
    }

    landscapeRequestInFlight = true;
    try {
      await native.lockAsync(OrientationLock.LANDSCAPE);
      fullscreenOrientationActive = true;
      return { supported: true, applied: true };
    } catch (error) {
      const classified = classifyTvOrientationLoadError(error);
      if (classified === "native-module-missing") {
        nativeModuleMissingCached = true;
        cachedNative = null;
        warnMissingOnce();
        return {
          supported: false,
          applied: false,
          reason: "native-module-missing",
        };
      }
      warnDev(
        "landscape lock failed — UI fullscreen stays usable in portrait",
        error
      );
      return { supported: false, applied: false, reason: "request-failed" };
    } finally {
      landscapeRequestInFlight = false;
    }
  } catch (error) {
    // Absolute last resort — never throw into React press handlers.
    const classified = classifyTvOrientationLoadError(error);
    if (classified === "native-module-missing") {
      nativeModuleMissingCached = true;
      warnMissingOnce();
      return {
        supported: false,
        applied: false,
        reason: "native-module-missing",
      };
    }
    warnDev("landscape request swallowed unexpected error", error);
    return { supported: false, applied: false, reason: "request-failed" };
  }
}

/**
 * Restore portrait-first policy once. Idempotent; never throws.
 */
export async function restoreTvPortraitOrientation(): Promise<TvOrientationResult> {
  try {
    if (!fullscreenOrientationActive) {
      return { supported: true, applied: false, reason: "already_restored" };
    }
    if (portraitRestoreInFlight) {
      return { supported: true, applied: false, reason: "already_restored" };
    }
    if (nativeModuleMissingCached) {
      fullscreenOrientationActive = false;
      return {
        supported: false,
        applied: false,
        reason: "native-module-missing",
      };
    }

    const native = loadNativeOrientationModule();
    portraitRestoreInFlight = true;
    try {
      if (!native?.lockAsync) {
        fullscreenOrientationActive = false;
        return {
          supported: false,
          applied: false,
          reason: "native-module-missing",
        };
      }
      await native.lockAsync(OrientationLock.PORTRAIT_UP);
      fullscreenOrientationActive = false;
      return { supported: true, applied: true };
    } catch (error) {
      fullscreenOrientationActive = false;
      const classified = classifyTvOrientationLoadError(error);
      if (classified === "native-module-missing") {
        nativeModuleMissingCached = true;
        cachedNative = null;
        warnMissingOnce();
        return {
          supported: false,
          applied: false,
          reason: "native-module-missing",
        };
      }
      warnDev("portrait restore failed — stopping further retries this session", error);
      return { supported: false, applied: false, reason: "request-failed" };
    } finally {
      portraitRestoreInFlight = false;
    }
  } catch (error) {
    fullscreenOrientationActive = false;
    const classified = classifyTvOrientationLoadError(error);
    if (classified === "native-module-missing") {
      nativeModuleMissingCached = true;
      warnMissingOnce();
      return {
        supported: false,
        applied: false,
        reason: "native-module-missing",
      };
    }
    warnDev("portrait restore swallowed unexpected error", error);
    return { supported: false, applied: false, reason: "request-failed" };
  }
}

/** Test/dev helper — reset in-memory owner flags without touching native. */
export function resetTvFullscreenOrientationOwnerForTests() {
  fullscreenOrientationActive = false;
  landscapeRequestInFlight = false;
  portraitRestoreInFlight = false;
  nativeModuleMissingCached = false;
  cachedNative = undefined;
  warnedMissingOnce = false;
  capabilityLoaderOverride = null;
}

export function setTvOrientationCapabilityLoaderForTests(
  loader: CapabilityLoader | null
) {
  capabilityLoaderOverride = loader;
  cachedNative = undefined;
  nativeModuleMissingCached = false;
  warnedMissingOnce = false;
}

export function getTvFullscreenOrientationOwnerStateForTests() {
  return {
    fullscreenOrientationActive,
    landscapeRequestInFlight,
    portraitRestoreInFlight,
    nativeModuleMissingCached,
    warnedMissingOnce,
  };
}
