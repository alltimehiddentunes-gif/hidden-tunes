import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

/**
 * 217 Home Fabric diagnostics — JS/OTA only.
 * BEST-KNOWN baseline after physical A/B: homeClipping forced ON.
 * (OFF was measurably worse; ON is not root-cause proof, but protective.)
 */
let homeRemoveClippedSubviewsOverride: boolean | null = true;
let clippingRevision = 0;
const clippingListeners = new Set<() => void>();

function bumpClippingRevision() {
  clippingRevision += 1;
  clippingListeners.forEach((listener) => listener());
}

const homeRenderReasonCounts: Record<string, number> = Object.create(null);
const appShellRenderReasonCounts: Record<string, number> = Object.create(null);
let renderReasonSampleActive = false;

export function setIos217HomeFabricSampleActive(active: boolean) {
  renderReasonSampleActive = !!active;
  if (!active) return;
  for (const key of Object.keys(homeRenderReasonCounts)) delete homeRenderReasonCounts[key];
  for (const key of Object.keys(appShellRenderReasonCounts)) delete appShellRenderReasonCounts[key];
}

export function resetIos217HomeFabricAb() {
  for (const key of Object.keys(homeRenderReasonCounts)) delete homeRenderReasonCounts[key];
  for (const key of Object.keys(appShellRenderReasonCounts)) delete appShellRenderReasonCounts[key];
}

export function setIos217HomeRemoveClippedSubviewsOverride(enabled: boolean | null) {
  homeRemoveClippedSubviewsOverride = enabled;
  bumpClippingRevision();
}

export function getIos217HomeRemoveClippedSubviewsOverride(): boolean | null {
  return homeRemoveClippedSubviewsOverride;
}

export function resolveIos217HomeRemoveClippedSubviews(): boolean {
  if (homeRemoveClippedSubviewsOverride !== null) return homeRemoveClippedSubviewsOverride;
  return Platform.OS === "android";
}

export function describeIos217HomeClippingMode(): string {
  if (homeRemoveClippedSubviewsOverride === true) return "ON (forced)";
  if (homeRemoveClippedSubviewsOverride === false) return "OFF (forced)";
  return Platform.OS === "ios" ? "OFF (ios default)" : "ON (android default)";
}

function subscribeClipping(listener: () => void) {
  clippingListeners.add(listener);
  return () => {
    clippingListeners.delete(listener);
  };
}

function getClippingRevision() {
  return clippingRevision;
}

export function useIos217HomeRemoveClippedSubviews(): boolean {
  useSyncExternalStore(subscribeClipping, getClippingRevision, getClippingRevision);
  return resolveIos217HomeRemoveClippedSubviews();
}

export function recordIos217HomeRenderReasons(reasons: string[]) {
  if (!renderReasonSampleActive) return;
  const unique = reasons.length ? [...new Set(reasons)] : ["unknown"];
  for (const reason of unique) {
    homeRenderReasonCounts[reason] = (homeRenderReasonCounts[reason] || 0) + 1;
  }
}

export function recordIos217AppShellRenderReasons(reasons: string[]) {
  if (!renderReasonSampleActive) return;
  const unique = reasons.length ? [...new Set(reasons)] : ["unknown"];
  for (const reason of unique) {
    appShellRenderReasonCounts[reason] = (appShellRenderReasonCounts[reason] || 0) + 1;
  }
}

function formatReasonCounts(label: string, counts: Record<string, number>) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `${label}=(none)`;
  return `${label}=${entries.map(([k, v]) => `${k}:${v}`).join(",")}`;
}

export function formatIos217HomeRenderReasons(): string {
  return [
    formatReasonCounts("homeRenderReasons", homeRenderReasonCounts),
    formatReasonCounts("appShellRenderReasons", appShellRenderReasonCounts),
  ].join("\n");
}

export function cycleIos217HomeClippingMode(): boolean {
  // Cycle: ON(true) → OFF(false) → ON(true). Default investigation baseline is ON.
  if (homeRemoveClippedSubviewsOverride === true) {
    homeRemoveClippedSubviewsOverride = false;
    bumpClippingRevision();
    return false;
  }
  homeRemoveClippedSubviewsOverride = true;
  bumpClippingRevision();
  return true;
}
