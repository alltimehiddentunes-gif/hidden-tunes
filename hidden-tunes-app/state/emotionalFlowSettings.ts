import {
  loadEmotionalFlowSettings,
  saveEmotionalFlowSettings,
} from "./emotionalFlowPersistence";

export type EmotionalFlowSettings = {
  emotionalFlowEnabled: boolean;
  stayInWorldEnabled: boolean;
  lateNightModeEnabled: boolean;
  activeWorldId: string | null;
};

const DEFAULT_SETTINGS: EmotionalFlowSettings = {
  emotionalFlowEnabled: true,
  stayInWorldEnabled: false,
  lateNightModeEnabled: false,
  activeWorldId: null,
};

let settings: EmotionalFlowSettings = { ...DEFAULT_SETTINGS };

const listeners = new Set<() => void>();

function notifyEmotionalFlowSettingsListeners() {
  listeners.forEach((listener) => listener());
}

function persistSettings() {
  void saveEmotionalFlowSettings(settings);
}

function applySettings(nextSettings: EmotionalFlowSettings) {
  settings = { ...nextSettings };
  notifyEmotionalFlowSettingsListeners();
}

void loadEmotionalFlowSettings().then((loaded) => {
  if (!loaded) {
    return;
  }

  applySettings({
    ...DEFAULT_SETTINGS,
    ...loaded,
  });
});

export function getEmotionalFlowSettings(): EmotionalFlowSettings {
  return settings;
}

export function subscribeEmotionalFlowSettings(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isEmotionalFlowEnabled() {
  return settings.emotionalFlowEnabled;
}

export function setEmotionalFlowEnabled(value: boolean) {
  if (settings.emotionalFlowEnabled === value) {
    return;
  }

  settings = {
    ...settings,
    emotionalFlowEnabled: value,
  };
  persistSettings();
  notifyEmotionalFlowSettingsListeners();
}

export function setStayInWorldEnabled(value: boolean) {
  if (settings.stayInWorldEnabled === value) {
    return;
  }

  settings = {
    ...settings,
    stayInWorldEnabled: value,
  };
  persistSettings();
  notifyEmotionalFlowSettingsListeners();
}

export function setLateNightModeEnabled(value: boolean) {
  if (settings.lateNightModeEnabled === value) {
    return;
  }

  settings = {
    ...settings,
    lateNightModeEnabled: value,
  };
  persistSettings();
  notifyEmotionalFlowSettingsListeners();
}

export function setActiveWorldId(worldId: string | null) {
  const normalized = worldId ? String(worldId).trim() : null;

  if (settings.activeWorldId === normalized) {
    return;
  }

  settings = {
    ...settings,
    activeWorldId: normalized,
    stayInWorldEnabled: normalized ? settings.stayInWorldEnabled : false,
  };
  persistSettings();
  notifyEmotionalFlowSettingsListeners();
}

export function hasActiveWorldContext() {
  return Boolean(settings.activeWorldId);
}
