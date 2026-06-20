import AsyncStorage from "@react-native-async-storage/async-storage";

export type UserRole = "listener" | "artist" | "uploader" | "admin" | "owner";
export type EnergyPreference = "calm" | "balanced" | "energetic";
export type DiscoveryStyle = "familiar" | "balanced" | "adventurous";

export type OnboardingPreferences = {
  userRole: UserRole;
  preferredGenres: string[];
  preferredMoods: string[];
  preferredEnergy: EnergyPreference;
  discoveryStyle: DiscoveryStyle;
};

export const ONBOARDING_STORAGE_KEYS = {
  legacyCompleted: "hidden_tunes_onboarding_seen",
  completed: "onboarding_completed",
  userRole: "user_role",
  preferredGenres: "preferred_genres",
  preferredMoods: "preferred_moods",
  preferredEnergy: "preferred_energy",
  discoveryStyle: "discovery_style",
} as const;

export const DEFAULT_LISTENER_PREFERENCES: OnboardingPreferences = {
  userRole: "listener",
  preferredGenres: [],
  preferredMoods: [],
  preferredEnergy: "balanced",
  discoveryStyle: "balanced",
};

const USER_ROLES: UserRole[] = [
  "listener",
  "artist",
  "uploader",
  "admin",
  "owner",
];

export function normalizeUserRole(value: string | null | undefined): UserRole {
  return USER_ROLES.includes(value as UserRole) ? (value as UserRole) : "listener";
}

export async function getStoredUserRole() {
  const storedRole = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEYS.userRole);
  return normalizeUserRole(storedRole);
}

let onboardingCompleteCache: boolean | null = null;
let onboardingStatusPromise: Promise<boolean> | null = null;

export function peekOnboardingComplete() {
  return onboardingCompleteCache;
}

export function primeOnboardingCompleteCache(completed: boolean) {
  onboardingCompleteCache = completed;
}

export function preloadOnboardingStatus() {
  if (!onboardingStatusPromise) {
    onboardingStatusPromise = hasCompletedOnboarding();
  }

  return onboardingStatusPromise;
}

export async function hasCompletedOnboarding() {
  if (onboardingCompleteCache !== null) {
    return onboardingCompleteCache;
  }

  const [completed, legacyCompleted] = await AsyncStorage.multiGet([
    ONBOARDING_STORAGE_KEYS.completed,
    ONBOARDING_STORAGE_KEYS.legacyCompleted,
  ]);

  onboardingCompleteCache =
    completed[1] === "true" || legacyCompleted[1] === "true";

  return onboardingCompleteCache;
}

export async function saveOnboardingPreferences(
  preferences: OnboardingPreferences
) {
  await AsyncStorage.multiSet([
    [ONBOARDING_STORAGE_KEYS.completed, "true"],
    [ONBOARDING_STORAGE_KEYS.legacyCompleted, "true"],
    [ONBOARDING_STORAGE_KEYS.userRole, preferences.userRole],
    [
      ONBOARDING_STORAGE_KEYS.preferredGenres,
      JSON.stringify(preferences.preferredGenres),
    ],
    [
      ONBOARDING_STORAGE_KEYS.preferredMoods,
      JSON.stringify(preferences.preferredMoods),
    ],
    [ONBOARDING_STORAGE_KEYS.preferredEnergy, preferences.preferredEnergy],
    [ONBOARDING_STORAGE_KEYS.discoveryStyle, preferences.discoveryStyle],
  ]);

  primeOnboardingCompleteCache(true);
}
