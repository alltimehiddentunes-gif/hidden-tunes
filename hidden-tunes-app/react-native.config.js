/**
 * Standalone preview/production must not autolink expo-dev-client native code.
 * iOS playback uses the hidden-audio config plugin (HiddenAudio native module).
 * Android keeps react-native-track-player; iOS RNTP autolinking stays off.
 */
const profile =
  process.env.EAS_BUILD_PROFILE ||
  process.env.EXPO_PUBLIC_BUILD_PROFILE ||
  "";

const isDevClientBuild = profile === "developmentClient";
const isStandaloneProfile =
  profile === "preview" || profile === "production" || profile === "local";
const isStandaloneBuild = !isDevClientBuild && isStandaloneProfile;
const disabled = { ios: null, android: null };

const dependencies = {
  "react-native-track-player": {
    platforms: {
      ios: null,
    },
  },
};

if (isStandaloneBuild) {
  for (const pkg of [
    "expo-dev-client",
    "expo-dev-launcher",
    "expo-dev-menu",
    "expo-dev-menu-interface",
  ]) {
    dependencies[pkg] = { platforms: disabled };
  }
}

module.exports = { dependencies };
