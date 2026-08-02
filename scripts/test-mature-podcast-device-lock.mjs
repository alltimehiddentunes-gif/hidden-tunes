import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const settings = read("utils/maturePodcastSettings.ts");
const auth = read("utils/maturePodcastAuthentication.ts");
const home = read("app/podcasts/index.tsx");
const mature = read("app/podcasts/mature.tsx");
const standardSearch = read("hooks/useDeferredSearchPodcastSections.ts");
const localSearch = read("hooks/usePodcastLocalSearch.ts");
const recent = read("services/podcastRecentlyPlayed.ts");
const config = read("app.json");
const flag = read("constants/maturePodcastFlags.ts");
const metadata = read("services/remoteMediaControls.types.ts");

const checks = [
  [settings.includes("enabled: false") && settings.includes("sessionUnlocked: false"), "locked defaults"],
  [home.includes("Adult podcasts are hidden until unlocked."), "locked card hides metadata"],
  [home.includes("Tap to Continue →"), "locked-card entry"],
  [
    !home.includes("This optional section is not currently available."),
    "visible locked card enters unlock flow",
  ],
  [settings.includes('trustedAgeStatus === "under_18"'), "under-18 denial"],
  [home.includes("Mature Podcasts Unavailable"), "neutral under-18 message"],
  [settings.includes('"adult_18_plus" | "unknown"'), "explicit age states"],
  [home.includes("matureConsentVisible"), "unknown/adult confirmation"],
  [home.includes("acceptMaturePodcastConsent"), "explicit consent action"],
  [
    home.indexOf("if (!result.success)") < home.indexOf("if (rememberConsent) await acceptMaturePodcastConsent()"),
    "failed authentication cannot persist consent",
  ],
  [auth.includes("authenticateAsync"), "native authentication"],
  [
    !auth.startsWith('import * as LocalAuthentication') &&
      auth.includes('await import("expo-local-authentication")'),
    "missing native module cannot crash route loading",
  ],
  [
    auth.indexOf('requireOptionalNativeModule("ExpoLocalAuthentication")') <
      auth.indexOf('await import("expo-local-authentication")'),
    "missing native module is detected before package evaluation",
  ],
  [auth.includes("disableDeviceFallback: false"), "device credential fallback"],
  [
    auth.includes('reason: "native_module_missing"') &&
      auth.includes('reason: "device_security_missing"'),
    "missing native module is not reported as missing device security",
  ],
  [
    auth.includes("getEnrolledLevelAsync") && !auth.includes("isEnrolledAsync"),
    "passcode-only devices are not rejected by biometric enrollment checks",
  ],
  [auth.includes('biometricsSecurityLevel: "strong"'), "strong Android biometrics"],
  [settings.includes("unlockMaturePodcastSession") && !auth.includes("trustedAgeStatus"), "auth is not age proof"],
  [mature.includes("AppState.addEventListener") && mature.includes("lockMaturePodcastSession"), "background relock"],
  [mature.includes("return () => lockMaturePodcastSession()"), "route-exit relock"],
  [settings.includes("sessionUnlocked: false") && !settings.includes("SESSION_KEY"), "restart relock"],
  [settings.includes("MATURE_PODCASTS_CONSENT_VERSION"), "versioned remembered consent"],
  [home.includes("hasRememberedMatureConsent") && home.includes("authenticateAndOpenMature"), "auth on every entry"],
  [mature.includes("Disable Mature Podcasts") && mature.includes("authenticateForMaturePodcasts"), "authenticated disable"],
  [standardSearch.includes("includeMature: false"), "global search excludes mature"],
  [localSearch.includes("includeMature: matureOnly"), "standard podcast search excludes mature"],
  [recent.includes("MATURE_RECENT_KEY") && recent.includes("!isMatureEpisode"), "history namespaces isolated"],
  [mature.includes("enabled ? catalog.shows : []"), "catalog not rendered before unlock"],
  [mature.includes("useMaturePodcastCatalog") && home.includes("/podcasts/mature"), "existing mature route reused"],
  [config.includes("expo-local-authentication") && config.includes("Hidden Tunes uses Face ID"), "native config"],
  [flag.includes('=== "true"'), "feature flag defaults off"],
  [metadata.includes("Private podcast playing"), "private external metadata"],
  [mature.includes("privacyCover") && mature.includes("Private content locked"), "app-switcher privacy cover"],
];

for (const [condition, label] of checks) assert.ok(condition, label);
console.log(`PASS mature podcast device lock contracts (${checks.length} checks)`);
