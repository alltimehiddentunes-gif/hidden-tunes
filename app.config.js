/**
 * EAS build profiles:
 * - developmentClient → includes expo-dev-client (Metro / QR / dev launcher)
 * - preview / production → standalone app, opens Hidden Tunes directly
 */
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
      image: "./assets/images/splash-lockup.png",
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

  const hasExpoVideoPlugin = basePlugins.some((entry) => {
    const pluginName = Array.isArray(entry) ? entry[0] : entry;
    return pluginName === "expo-video";
  });

  const expoVideoPlugin = [
    "expo-video",
    {
      supportsPictureInPicture: true,
      supportsBackgroundPlayback: true,
    },
  ];

  let plugins = hasSplashPlugin ? basePlugins : [...basePlugins, splashPlugin];

  if (!hasExpoVideoPlugin) {
    plugins = [...plugins, expoVideoPlugin];
  } else {
    // Ensure existing expo-video entry carries PiP / background flags without duplicating.
    plugins = plugins.map((entry) => {
      const pluginName = Array.isArray(entry) ? entry[0] : entry;
      if (pluginName !== "expo-video") return entry;
      const existingOptions =
        Array.isArray(entry) && entry[1] && typeof entry[1] === "object"
          ? entry[1]
          : {};
      return [
        "expo-video",
        {
          ...existingOptions,
          supportsPictureInPicture: true,
          supportsBackgroundPlayback: true,
        },
      ];
    });
  }

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
      isStandaloneBuild,
      isDevClientBuild,
    },
  };
};
