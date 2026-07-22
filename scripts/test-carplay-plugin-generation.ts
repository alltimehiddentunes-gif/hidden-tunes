/**
 * Simulates the hidden-audio config plugin native file copy (clean prebuild).
 * Confirms generated output includes Favorites sanitizer + tab validation.
 *
 * Run: npx tsx scripts/test-carplay-plugin-generation.ts
 */
// @ts-nocheck
const fs = require("fs");
const path = require("path");
const os = require("os");

const root = process.cwd();

function assertOk(condition, label) {
  if (!condition) throw new Error(label);
}

function main() {
  const pluginPath = path.join(root, "plugins/hidden-audio/index.js");
  const plugin = fs.readFileSync(pluginPath, "utf8");

  const nativeFilesMatch = plugin.match(/const NATIVE_FILES = \[([\s\S]*?)\];/);
  assertOk(nativeFilesMatch, "NATIVE_FILES present in plugin");

  const listed = [...nativeFilesMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assertOk(listed.includes("HiddenAudioCarPlayManager.swift"), "manager in NATIVE_FILES");
  assertOk(listed.includes("HiddenAudioCarPlayCatalog.swift"), "catalog in NATIVE_FILES");
  assertOk(listed.includes("HiddenAudioCarPlayTabValidation.swift"), "validation in NATIVE_FILES");
  assertOk(listed.includes("CarPlaySceneDelegate.swift"), "scene in NATIVE_FILES");

  const sourceDir = path.join(root, "plugins/hidden-audio/ios/HiddenAudioModule");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ht-carplay-prebuild-"));

  for (const fileName of listed) {
    const src = path.join(sourceDir, fileName);
    assertOk(fs.existsSync(src), `source exists: ${fileName}`);
    fs.copyFileSync(src, path.join(outDir, fileName));
  }

  // Also mirror into the local ios project copy (same as prebuild destination shape).
  const iosDest = path.join(root, "ios/HiddenTunes/HiddenAudioModule");
  fs.mkdirSync(iosDest, { recursive: true });
  for (const fileName of listed) {
    fs.copyFileSync(path.join(sourceDir, fileName), path.join(iosDest, fileName));
  }

  const generatedCatalog = fs.readFileSync(path.join(outDir, "HiddenAudioCarPlayCatalog.swift"), "utf8");
  const generatedManager = fs.readFileSync(path.join(outDir, "HiddenAudioCarPlayManager.swift"), "utf8");
  const generatedValidation = fs.readFileSync(
    path.join(outDir, "HiddenAudioCarPlayTabValidation.swift"),
    "utf8"
  );
  const iosCatalog = fs.readFileSync(path.join(iosDest, "HiddenAudioCarPlayCatalog.swift"), "utf8");
  const iosValidation = fs.readFileSync(
    path.join(iosDest, "HiddenAudioCarPlayTabValidation.swift"),
    "utf8"
  );

  assertOk(generatedCatalog.includes("sanitizedFavoritesNodes"), "generated catalog sanitizer");
  assertOk(generatedCatalog.includes("No favorites yet"), "generated empty favorites copy");
  assertOk(generatedManager.includes("makeFavoritesSection"), "generated favorites section");
  assertOk(generatedManager.includes("validateCarPlayTabs"), "generated validates tabs");
  assertOk(generatedValidation.includes("func validateCarPlayTabs"), "generated validator");
  assertOk(iosCatalog.includes("sanitizedFavoritesNodes"), "ios copy has sanitizer");
  assertOk(iosValidation.includes("func validateCarPlayTabs"), "ios copy has validator");

  // Confirm invalid favorites cannot reach CPTabBarTemplate without validation.
  assertOk(
    generatedManager.indexOf("HiddenAudioCarPlayTabValidation.validateCarPlayTabs(templates)") <
      generatedManager.indexOf("CPTabBarTemplate(templates: templates)"),
    "generated: validation before CPTabBarTemplate"
  );

  console.log("carplay-plugin-generation: ok");
  console.log(`temp generated dir: ${outDir}`);
  console.log(`ios synced: ${iosDest}`);
  console.log(`files copied: ${listed.join(", ")}`);
}

main();
