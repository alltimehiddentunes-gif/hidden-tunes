#!/usr/bin/env node
/**
 * Development validation for localization dictionaries.
 * Run: node scripts/validate-localization.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const LOCALES = [
  "en", "es", "fr", "de", "pt", "it", "nl", "pl", "ru", "tr",
  "ar", "hi", "zh-CN", "zh-TW", "ja", "ko", "id", "vi", "th", "fil",
];

function collectLeafKeys(value, prefix = "") {
  const keys = new Map();
  if (typeof value === "string") {
    if (prefix) keys.set(prefix, value);
    return keys;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return keys;
  for (const [childKey, childValue] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${childKey}` : childKey;
    for (const [leafKey, leafValue] of collectLeafKeys(childValue, nextPrefix)) {
      keys.set(leafKey, leafValue);
    }
  }
  return keys;
}

function validateLocale(locale, dictionary, reference) {
  const issues = [];
  const referenceKeys = collectLeafKeys(reference);
  const localeKeys = collectLeafKeys(dictionary);

  for (const [key] of referenceKeys) {
    if (!localeKeys.has(key)) {
      issues.push({ locale, type: "missing_key", key });
      continue;
    }
    const value = localeKeys.get(key);
    if (typeof value !== "string") {
      issues.push({ locale, type: "invalid_value", key });
    } else if (!value.trim()) {
      issues.push({ locale, type: "empty_value", key });
    }
  }

  for (const key of localeKeys.keys()) {
    if (!referenceKeys.has(key)) {
      issues.push({ locale, type: "extra_key", key });
    }
  }

  return issues;
}

async function loadLocaleModule(locale) {
  const filePath = path.join(root, "localization", "locales", `${locale}.ts`);
  const url = pathToFileURL(filePath).href;
  const mod = await import(url);
  return mod.default;
}

async function main() {
  const en = await loadLocaleModule("en");
  let totalIssues = 0;

  for (const locale of LOCALES) {
    const dictionary = await loadLocaleModule(locale);
    const issues = validateLocale(locale, dictionary, en);
    if (issues.length > 0) {
      totalIssues += issues.length;
      console.error(`[FAIL] ${locale}: ${issues.length} issue(s)`);
      for (const issue of issues.slice(0, 5)) {
        console.error(`  - ${issue.type}: ${issue.key}`);
      }
    } else {
      const size = JSON.stringify(dictionary).length;
      console.log(`[OK] ${locale} (${size} bytes source JSON)`);
    }
  }

  if (totalIssues > 0) {
    console.error(`\nValidation failed with ${totalIssues} total issues.`);
    process.exit(1);
  }

  console.log(`\nAll ${LOCALES.length} locale dictionaries validated successfully.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
