#!/usr/bin/env node
/**
 * Unit tests for localization pure functions.
 * Run: node scripts/test-localization.mjs
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function importModule(relativePath) {
  const url = pathToFileURL(path.join(root, relativePath)).href;
  return import(url);
}

async function runTests() {
  const { normalizeLocale } = await importModule("localization/normalizeLocale.ts");
  const { detectDeviceLocale } = await importModule("localization/detectLocale.ts");
  const { isSupportedLocale } = await importModule("localization/supportedLocales.ts");
  const { createTranslateFunction } = await importModule("localization/translate.ts");
  const en = (await importModule("localization/locales/en.ts")).default;

  // normalizeLocale
  assert(normalizeLocale("en-US") === "en", "en-US → en");
  assert(normalizeLocale("es-MX") === "es", "es-MX → es");
  assert(normalizeLocale("zh-Hans") === "zh-CN", "zh-Hans → zh-CN");
  assert(normalizeLocale("zh-Hant") === "zh-TW", "zh-Hant → zh-TW");
  assert(normalizeLocale("fil-PH") === "fil", "fil-PH → fil");
  assert(normalizeLocale("xx-YY") === "en", "unsupported → en");

  // isSupportedLocale
  assert(isSupportedLocale("de"), "de is supported");
  assert(!isSupportedLocale("xx"), "xx is not supported");

  // detectDeviceLocale returns supported locale
  const device = detectDeviceLocale();
  assert(isSupportedLocale(device), "device locale is supported");

  // English fallback
  const t = createTranslateFunction(en, en);
  assert(t("common.play") === "Play", "play lookup");
  assert(
    t("profile.appVersion", { version: "1.0" }) === "Hidden Tunes v1.0",
    "interpolation"
  );

  // Missing key fallback
  const partial = { common: { play: "Jugar" } };
  const tPartial = createTranslateFunction(partial, en);
  assert(tPartial("common.play") === "Jugar", "active dict used");
  assert(tPartial("common.pause") === "Pause", "english fallback");

  console.log("All localization unit tests passed.");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
