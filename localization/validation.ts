import type { TranslationDictionary } from "./types";

type ValidationIssue = {
  locale: string;
  type: "missing_key" | "extra_key" | "invalid_value" | "empty_value";
  key: string;
  detail?: string;
};

function collectLeafKeys(
  value: unknown,
  prefix = ""
): Map<string, string> {
  const keys = new Map<string, string>();

  if (typeof value === "string") {
    if (prefix) keys.set(prefix, value);
    return keys;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return keys;
  }

  for (const [childKey, childValue] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${childKey}` : childKey;
    for (const [leafKey, leafValue] of collectLeafKeys(childValue, nextPrefix)) {
      keys.set(leafKey, leafValue);
    }
  }

  return keys;
}

export function validateLocaleDictionary(
  locale: string,
  dictionary: TranslationDictionary,
  reference: TranslationDictionary
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const referenceKeys = collectLeafKeys(reference);
  const localeKeys = collectLeafKeys(dictionary);

  for (const [key, referenceValue] of referenceKeys) {
    if (!localeKeys.has(key)) {
      issues.push({ locale, type: "missing_key", key });
      continue;
    }

    const value = localeKeys.get(key);
    if (typeof value !== "string") {
      issues.push({
        locale,
        type: "invalid_value",
        key,
        detail: `Expected string, received ${typeof value}`,
      });
      continue;
    }

    if (!value.trim()) {
      issues.push({ locale, type: "empty_value", key });
    }

    if (typeof referenceValue !== "string") {
      issues.push({
        locale,
        type: "invalid_value",
        key,
        detail: "Reference value is not a string",
      });
    }
  }

  for (const key of localeKeys.keys()) {
    if (!referenceKeys.has(key)) {
      issues.push({ locale, type: "extra_key", key });
    }
  }

  return issues;
}

export function assertLocaleDictionary(
  locale: string,
  dictionary: TranslationDictionary,
  reference: TranslationDictionary
): void {
  const issues = validateLocaleDictionary(locale, dictionary, reference);
  if (issues.length === 0) return;

  const summary = issues
    .slice(0, 10)
    .map((issue) => `${issue.type}:${issue.key}`)
    .join(", ");

  throw new Error(
    `[localization] ${locale} dictionary validation failed (${issues.length} issues): ${summary}`
  );
}

export { collectLeafKeys };
