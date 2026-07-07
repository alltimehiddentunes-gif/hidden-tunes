/**
 * Native build profiles:
 * - developmentClient → includes expo-dev-client (Metro / dev launcher)
 * - preview / production / local standalone → direct app launch, no dev client
 */
const { execSync } = require("child_process");

function readShortGitCommit() {
  if (process.env.EAS_BUILD_GIT_COMMIT_HASH) {
    return String(process.env.EAS_BUILD_GIT_COMMIT_HASH).slice(0, 7);
  }

  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      cwd: __dirname,
    }).trim();
  } catch {
    return "unknown";
  }
}

module.exports = ({ config }) => {
  const appJson = require("./app.json");
  const profile =
    process.env.EAS_BUILD_PROFILE ||
    process.env.EXPO_PUBLIC_BUILD_PROFILE ||
    "";
  const isDevClientBuild = profile === "developmentClient";
  const isStandaloneBuild = !isDevClientBuild;

  const basePlugins = (appJson.expo.plugins || []).filter((entry) => {
    if (isDevClientBuild) return true;
    const pluginName = Array.isArray(entry) ? entry[0] : entry;
    return pluginName !== "expo-dev-client";
  });

  const splashPlugin = [
    "expo-splash-screen",
    {
      image: "./assets/images/icon.png",
      imageWidth: 200,
      resizeMode: "contain",
      backgroundColor: "#000000",
      dark: {
        backgroundColor: "#000000",
      },
    },
  ];

  const hasSplashPlugin = basePlugins.some((entry) => {
    const pluginName = Array.isArray(entry) ? entry[0] : entry;
    return pluginName === "expo-splash-screen";
  });

  const hasStandaloneGuard = basePlugins.some((entry) => {
    const pluginName = Array.isArray(entry) ? entry[0] : entry;
    return pluginName === "./plugins/standalone-build-guard";
  });

  let plugins = hasSplashPlugin ? basePlugins : [...basePlugins, splashPlugin];

  if (isStandaloneBuild && !hasStandaloneGuard) {
    plugins = [...plugins, "./plugins/standalone-build-guard"];
  }

  return {
    ...appJson.expo,
    name: "Hidden Tunes",
    ...config,
    plugins,
    ios: {
      ...appJson.expo.ios,
      ...config.ios,
      infoPlist: {
        ...(appJson.expo.ios?.infoPlist || {}),
        ...(config.ios?.infoPlist || {}),
        UIBackgroundModes: ["audio"],
      },
    },
    android: {
      ...appJson.expo.android,
      ...config.android,
    },
    extra: {
      ...appJson.expo.extra,
      ...config.extra,
      easBuildProfile: profile || "local",
      gitCommit: readShortGitCommit(),
      isStandaloneBuild,
      isDevClientBuild,
    },
  };
};
