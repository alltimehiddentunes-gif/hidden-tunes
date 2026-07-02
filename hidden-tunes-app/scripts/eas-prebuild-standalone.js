#!/usr/bin/env node
/**
 * Standalone EAS builds (preview/production): patch autolinking so expo-dev-client
 * native code is never linked. Do NOT delete node_modules packages — CocoaPods/Gradle
 * still reference those paths and Xcode/Gradle will fail if folders are missing.
 */
const fs = require("fs");
const path = require("path");

const profile =
  process.env.EAS_BUILD_PROFILE || process.env.EXPO_PUBLIC_BUILD_PROFILE || "";

if (profile !== "preview" && profile !== "production") {
  console.log(
    `[eas-prebuild-standalone] Skipping standalone autolinking patch for profile="${profile || "local"}".`
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
  `[eas-prebuild-standalone] Profile=${profile} patched package.json expo.autolinking.exclude:`,
  pkg.expo.autolinking.exclude.join(", ")
);
