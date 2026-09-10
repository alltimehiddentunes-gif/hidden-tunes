const MAX_VALUES_PER_FILTER = 8;

function normalizeValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\-\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function valuesFor(query, keys) {
  const raw = keys
    .map((key) => query?.[key])
    .find((value) => value !== undefined && value !== null && String(value).trim() !== "");
  const values = Array.isArray(raw) ? raw : String(raw || "").split(",");
  return Array.from(new Set(values.map(normalizeValue).filter(Boolean))).slice(0, MAX_VALUES_PER_FILTER);
}

export function normalizeMusicTaxonomyFilters(query = {}) {
  return Object.fromEntries(
    Object.entries({
      genre: valuesFor(query, ["taxonomyGenre", "genre"]),
      subgenre: valuesFor(query, ["subgenre", "taxonomySubgenre"]),
      mood: valuesFor(query, ["taxonomyMood", "mood"]),
      region: valuesFor(query, ["region", "regionalStyle", "regional_style"]),
      language: valuesFor(query, ["language", "languages"]),
      activity: valuesFor(query, ["activity", "activities"]),
      era: valuesFor(query, ["era"]),
      tempo: valuesFor(query, ["tempo", "tempoClass", "tempo_class"]),
    }).filter(([, values]) => values.length > 0)
  );
}

export const MUSIC_TAXONOMY_FILTER_LIMITS = {
  maxValuesPerFilter: MAX_VALUES_PER_FILTER,
};
