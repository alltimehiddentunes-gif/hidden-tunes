/**
 * EAS build profiles:
 * - developmentClient → includes expo-dev-client (Metro / QR / dev launcher)
 * - preview / production → standalone app, opens Hidden Tunes directly
 */
module.exports = ({ config }) => {
  const appJson = require("./app.json");
  const profile = process.env.EAS_BUILD_PROFILE || "";
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

  const plugins = hasSplashPlugin ? basePlugins : [...basePlugins, splashPlugin];

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
