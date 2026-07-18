export function isMatureTvTestModeEnabled() {
  return process.env.EXPO_PUBLIC_ENABLE_MATURE_TV_TEST === "true";
}
