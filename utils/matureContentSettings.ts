import AsyncStorage from "@react-native-async-storage/async-storage";

import { clearMaturePodcastCache } from "./podcastDiscoveryCache";
import { clearMatureRadioCache } from "../services/radio/radioCache";

export const MATURE_CONTENT_ENABLED_KEY = "@hidden_tunes_mature_content_enabled_v1";
export const MATURE_CONTENT_CONSENT_KEY = "@hidden_tunes_mature_content_consent_v1";

export type MatureContentSettings = {
  enabled: boolean;
  hasConsent: boolean;
  consentAt: string | null;
};

const DEFAULT_SETTINGS: MatureContentSettings = {
  enabled: false,
  hasConsent: false,
  consentAt: null,
};

let settings: MatureContentSettings = { ...DEFAULT_SETTINGS };
let hydrated = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function applySettings(next: MatureContentSettings) {
  settings = { ...next };
  notifyListeners();
}

export function getMatureContentSettings(): MatureContentSettings {
  return settings;
}

export function subscribeMatureContentSettings(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function hydrateMatureContentSettings() {
  if (hydrated) return settings;

  try {
    const [enabledRaw, consentRaw] = await Promise.all([
      AsyncStorage.getItem(MATURE_CONTENT_ENABLED_KEY),
      AsyncStorage.getItem(MATURE_CONTENT_CONSENT_KEY),
    ]);

    applySettings({
      enabled: enabledRaw === "true",
      hasConsent: Boolean(consentRaw),
      consentAt: consentRaw || null,
    });
  } catch {
    applySettings({ ...DEFAULT_SETTINGS });
  }

  hydrated = true;
  return settings;
}

export function shouldIncludeMatureInApi() {
  return settings.enabled && settings.hasConsent;
}

export async function enableMatureContentWithConsent() {
  const consentAt = new Date().toISOString();

  await Promise.all([
    AsyncStorage.setItem(MATURE_CONTENT_ENABLED_KEY, "true"),
    AsyncStorage.setItem(MATURE_CONTENT_CONSENT_KEY, consentAt),
  ]);

  applySettings({
    enabled: true,
    hasConsent: true,
    consentAt,
  });
}

export async function grantMatureContentConsent() {
  const consentAt = new Date().toISOString();

  await Promise.all([
    AsyncStorage.setItem(MATURE_CONTENT_ENABLED_KEY, "true"),
    AsyncStorage.setItem(MATURE_CONTENT_CONSENT_KEY, consentAt),
  ]);

  applySettings({
    enabled: true,
    hasConsent: true,
    consentAt,
  });
}

export async function disableMatureContent() {
  await Promise.all([
    AsyncStorage.removeItem(MATURE_CONTENT_ENABLED_KEY),
    AsyncStorage.removeItem(MATURE_CONTENT_CONSENT_KEY),
  ]);

  clearMatureRadioCache();
  await clearMaturePodcastCache();

  applySettings({ ...DEFAULT_SETTINGS });
}

void hydrateMatureContentSettings();
