/**
 * EAS build profiles:
 * - developmentClient → includes expo-dev-client (Metro / QR / dev launcher)
 * - preview / production → standalone app, opens Hidden Tunes directly
 */
module.exports = ({ config }) => {
  const appJson = require("./app.json");
  const profile = process.env.EAS_BUILD_PROFILE || "";
  const isDevClientBuild = profile === "developmentClient";

  const plugins = (appJson.expo.plugins || []).filter((entry) => {
    if (isDevClientBuild) return true;
    const pluginName = Array.isArray(entry) ? entry[0] : entry;
    return pluginName !== "expo-dev-client";
  });

  return {
    ...appJson.expo,
    ...config,
    plugins,
    extra: {
      ...appJson.expo.extra,
      easBuildProfile: profile || "local",
    },
  };
};
