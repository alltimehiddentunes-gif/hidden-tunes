#!/usr/bin/env node
/**
 * Patch autolinking excludes for standalone EAS builds.
 * Do not delete dev-client packages from node_modules — CocoaPods/Gradle still
 * reference those paths and the build will fail if folders are missing.
 */
const fs = require("fs");
const path = require("path");

const profile =
  process.env.EAS_BUILD_PROFILE || process.env.EXPO_PUBLIC_BUILD_PROFILE || "";

if (profile !== "preview" && profile !== "production") {
  console.log(
    `[eas-prebuild-standalone] Skipping for profile="${profile || "local"}".`
  );
  process.exit(0);
}

const root = path.join(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

const exclude = [
  "expo-dev-client",
  "expo-dev-launcher",
  "expo-dev-menu",
  "expo-dev-menu-interface",
];

pkg.expo = pkg.expo || {};
pkg.expo.autolinking = {
  ...(pkg.expo.autolinking || {}),
  exclude: [...new Set([...(pkg.expo.autolinking?.exclude || []), ...exclude])],
};

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(
  `[eas-prebuild-standalone] Profile=${profile} patched expo.autolinking.exclude:`,
  pkg.expo.autolinking.exclude.join(", ")
);
