/**
 * Standalone native builds must not autolink expo-dev-client.
 * iOS uses HiddenAudio instead of react-native-track-player.
 */
const profile =
  process.env.EAS_BUILD_PROFILE ||
  process.env.EXPO_PUBLIC_BUILD_PROFILE ||
  "";

const isDevClientBuild = profile === "developmentClient";
const isStandaloneBuild = !isDevClientBuild;
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
