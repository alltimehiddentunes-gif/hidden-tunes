import AsyncStorage from "@react-native-async-storage/async-storage";

export const MATURE_PODCASTS_ENABLED_KEY = "@hidden_tunes_mature_podcasts_enabled_v1";
export const MATURE_PODCASTS_CONSENT_KEY = "@hidden_tunes_mature_podcasts_consent_v1";

export type MaturePodcastSettings = {
  enabled: boolean;
  hasConsent: boolean;
  consentAt: string | null;
};

const DEFAULT: MaturePodcastSettings = {
  enabled: false,
  hasConsent: false,
  consentAt: null,
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

export function getMaturePodcastSettings(): MaturePodcastSettings {
  return settings;
}

export function subscribeMaturePodcastSettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function hydrateMaturePodcastSettings() {
  if (hydrated) return settings;

  try {
    const [enabledRaw, consentRaw] = await Promise.all([
      AsyncStorage.getItem(MATURE_PODCASTS_ENABLED_KEY),
      AsyncStorage.getItem(MATURE_PODCASTS_CONSENT_KEY),
    ]);

    apply({
      enabled: enabledRaw === "true",
      hasConsent: Boolean(consentRaw),
      consentAt: consentRaw || null,
    });
  } catch {
    apply({ ...DEFAULT });
  }

  hydrated = true;
  return settings;
}

export function shouldIncludeMaturePodcasts() {
  return settings.enabled && settings.hasConsent;
}

export async function enableMaturePodcastsWithConsent() {
  const consentAt = new Date().toISOString();
  await Promise.all([
    AsyncStorage.setItem(MATURE_PODCASTS_ENABLED_KEY, "true"),
    AsyncStorage.setItem(MATURE_PODCASTS_CONSENT_KEY, consentAt),
  ]);
  apply({ enabled: true, hasConsent: true, consentAt });
}

export async function disableMaturePodcasts() {
  await Promise.all([
    AsyncStorage.removeItem(MATURE_PODCASTS_ENABLED_KEY),
    AsyncStorage.removeItem(MATURE_PODCASTS_CONSENT_KEY),
  ]);
  apply({ ...DEFAULT });
}

void hydrateMaturePodcastSettings();
