import AsyncStorage from "@react-native-async-storage/async-storage";

import { clearPodcastCachesByPrefix } from "../services/podcast/podcastCache";

export const MATURE_PODCASTS_ENABLED_KEY = "@hidden_tunes_mature_podcasts_enabled_v1";
export const MATURE_PODCASTS_CONSENT_KEY = "@hidden_tunes_mature_podcasts_consent_v1";
export const MATURE_PODCASTS_CONSENT_VERSION = "mature-podcasts-v1";

export type MatureAgeStatus = "under_18" | "adult_18_plus" | "unknown";

export type MaturePodcastSettings = {
  enabled: boolean;
  hasConsent: boolean;
  consentVersion: string | null;
  consentAt: string | null;
  trustedAgeStatus: MatureAgeStatus;
  sessionUnlocked: boolean;
};

const DEFAULT: MaturePodcastSettings = {
  enabled: false,
  hasConsent: false,
  consentVersion: null,
  consentAt: null,
  trustedAgeStatus: "unknown",
  sessionUnlocked: false,
};

let settings: MaturePodcastSettings = { ...DEFAULT };
let hydrated = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function apply(next: MaturePodcastSettings) {
  settings = { ...next };
  notify();
}

export function getMaturePodcastSettings() {
  return settings;
}

export function subscribeMaturePodcastSettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Replace this provider when a trusted platform/account/backend age signal exists. */
export async function getTrustedMatureAgeStatus(): Promise<MatureAgeStatus> {
  return "unknown";
}

export async function refreshTrustedMatureAgeStatus() {
  const trustedAgeStatus = await getTrustedMatureAgeStatus();
  if (trustedAgeStatus === "under_18") {
    await disableMaturePodcasts();
    apply({ ...settings, trustedAgeStatus, sessionUnlocked: false });
    return trustedAgeStatus;
  }
  apply({ ...settings, trustedAgeStatus });
  return trustedAgeStatus;
}

export async function hydrateMaturePodcastSettings() {
  if (hydrated) return settings;
  try {
    const [enabledRaw, consentRaw] = await Promise.all([
      AsyncStorage.getItem(MATURE_PODCASTS_ENABLED_KEY),
      AsyncStorage.getItem(MATURE_PODCASTS_CONSENT_KEY),
    ]);
    const consent = consentRaw ? JSON.parse(consentRaw) : null;
    const validConsent =
      consent?.accepted === true && consent?.consentVersion === MATURE_PODCASTS_CONSENT_VERSION;
    apply({
      ...DEFAULT,
      enabled: enabledRaw === "true" && validConsent,
      hasConsent: validConsent,
      consentVersion: validConsent ? consent.consentVersion : null,
      consentAt: validConsent ? String(consent.acceptedAt || "") || null : null,
      sessionUnlocked: false,
    });
  } catch {
    apply({ ...DEFAULT });
  }
  hydrated = true;
  await refreshTrustedMatureAgeStatus();
  return settings;
}

export function hasRememberedMatureConsent() {
  return settings.enabled && settings.hasConsent &&
    settings.consentVersion === MATURE_PODCASTS_CONSENT_VERSION;
}

/** Catalog access requires both remembered consent and this live authenticated session. */
export function shouldIncludeMaturePodcasts() {
  return hasRememberedMatureConsent() && settings.sessionUnlocked &&
    settings.trustedAgeStatus !== "under_18";
}

export async function acceptMaturePodcastConsent() {
  const acceptedAt = new Date().toISOString();
  const consent = { accepted: true, consentVersion: MATURE_PODCASTS_CONSENT_VERSION, acceptedAt };
  await Promise.all([
    AsyncStorage.setItem(MATURE_PODCASTS_ENABLED_KEY, "true"),
    AsyncStorage.setItem(MATURE_PODCASTS_CONSENT_KEY, JSON.stringify(consent)),
  ]);
  apply({
    ...settings,
    enabled: true,
    hasConsent: true,
    consentVersion: MATURE_PODCASTS_CONSENT_VERSION,
    consentAt: acceptedAt,
  });
}

export function unlockMaturePodcastSession() {
  if (!hasRememberedMatureConsent() || settings.trustedAgeStatus === "under_18") return false;
  apply({ ...settings, sessionUnlocked: true });
  return true;
}

export function lockMaturePodcastSession() {
  if (!settings.sessionUnlocked) return;
  apply({ ...settings, sessionUnlocked: false });
}

/** Backward-compatible consent helper. It never authenticates or unlocks a session. */
export const enableMaturePodcastsWithConsent = acceptMaturePodcastConsent;

export async function disableMaturePodcasts() {
  await Promise.all([
    AsyncStorage.removeItem(MATURE_PODCASTS_ENABLED_KEY),
    AsyncStorage.removeItem(MATURE_PODCASTS_CONSENT_KEY),
  ]);
  clearPodcastCachesByPrefix("podcast-shows:mature:");
  apply({ ...DEFAULT, trustedAgeStatus: settings.trustedAgeStatus });
}

void hydrateMaturePodcastSettings();
