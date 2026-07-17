import type {
  TranslationDictionary,
  TranslationKey,
  TranslationVariables,
} from "./types";

const loggedMissingKeys = new Set<string>();

function getNestedValue(
  dictionary: TranslationDictionary | null | undefined,
  key: string
): unknown {
  if (!dictionary) return undefined;

  const parts = key.split(".");
  let current: unknown = dictionary;

  for (const part of parts) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function interpolate(template: string, variables?: TranslationVariables): string {
  if (!variables) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (_, token: string) => {
    const value = variables[token];
    return value == null ? "" : String(value);
  });
}

function logMissingKeyOnce(key: string): void {
  if (typeof __DEV__ === "undefined" || !__DEV__ || loggedMissingKeys.has(key)) return;
  loggedMissingKeys.add(key);
  console.warn(`[localization] Missing translation key: ${key}`);
}

export function createTranslateFunction(
  activeDictionary: TranslationDictionary,
  englishDictionary: TranslationDictionary
) {
  return function translate(
    key: TranslationKey,
    variables?: TranslationVariables
  ): string {
    const activeValue = getNestedValue(activeDictionary, key);
    if (typeof activeValue === "string" && activeValue.length > 0) {
      return interpolate(activeValue, variables);
    }

    const englishValue = getNestedValue(englishDictionary, key);
    if (typeof englishValue === "string" && englishValue.length > 0) {
      logMissingKeyOnce(key);
      return interpolate(englishValue, variables);
    }

    logMissingKeyOnce(key);
    // Never surface namespace paths like "home.hero.play" in production UI.
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      return key;
    }
    const leaf = String(key).split(".").pop() || "Hidden Tunes";
    return leaf.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
  };
}

export function isTranslationDictionary(
  value: unknown
): value is TranslationDictionary {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
