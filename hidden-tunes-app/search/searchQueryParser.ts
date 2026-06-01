export type ParsedSearchQuery = {
  rawQuery: string;
  textTokens: string[];
  emotionalTokens: string[];
  worldTokens: string[];
  normalizedText: string;
};

const PHRASE_EMOTIONAL_MAP: Record<string, string> = {
  "late night": "late-night",
  "night drive": "night-drive",
  "reverb heavy": "reverb-heavy",
  "deep feelings": "deep-feelings",
};

const PHRASE_WORLD_MAP: Record<string, string> = {
  "late night": "late-night",
  "party energy": "party-energy",
  "deep feelings": "deep-feelings",
  "rain world": "rain_world",
  "future nostalgia": "future_nostalgia",
  "human fragility": "human_fragility",
  "rooftop night": "rooftop_night",
  "digital loneliness": "digital_loneliness",
};

const EMOTIONAL_WORD_MAP: Record<string, string> = {
  warm: "warm",
  soft: "soft",
  "late-night": "late-night",
  latenight: "late-night",
  nostalgic: "nostalgia",
  nostalgia: "nostalgia",
  fragile: "fragile",
  dark: "dark",
  energetic: "energy",
  energy: "energy",
  calm: "calm",
  heartbreak: "heartbreak",
  cinematic: "cinematic",
  rain: "rainy",
  rainy: "rainy",
  neon: "urban",
  melancholy: "melancholy",
  intimate: "intimate",
  dreamy: "dreamy",
  healing: "healing",
  peaceful: "peace",
  peace: "peace",
  longing: "longing",
  romantic: "romantic",
  soulful: "soulful",
  ambient: "ambient",
  minimal: "minimal",
  ethereal: "ethereal",
  reflective: "reflective",
  vulnerable: "vulnerability",
  vulnerability: "vulnerability",
  comfort: "comfort",
  acoustic: "acoustic",
  organic: "organic",
  lush: "lush",
  breathy: "breathy",
  whispered: "whispered",
  emotional: "emotional",
  raw: "raw",
  smooth: "smooth",
  airy: "airy",
};

const WORLD_WORD_MAP: Record<string, string> = {
  "late-night": "late-night",
  latenight: "late-night",
  midnight: "late-night",
  healing: "healing",
  party: "party-energy",
  energetic: "party-energy",
  dance: "party-energy",
  romantic: "romantic",
  romance: "romantic",
  love: "romantic",
  nostalgic: "nostalgic",
  nostalgia: "nostalgic",
  calm: "calm",
  focus: "focus",
  heartbreak: "heartbreak",
  cinematic: "cinematic",
  "deep-feelings": "deep-feelings",
  deep: "deep-feelings",
  feelings: "deep-feelings",
  rainworld: "rain_world",
  rain_world: "rain_world",
  futurenostalgia: "future_nostalgia",
  future_nostalgia: "future_nostalgia",
  humanfragility: "human_fragility",
  human_fragility: "human_fragility",
  rooftopnight: "rooftop_night",
  rooftop_night: "rooftop_night",
  digitalloneliness: "digital_loneliness",
  digital_loneliness: "digital_loneliness",
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniqueTags(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function stripMatchedPhrase(query: string, phrase: string) {
  const pattern = new RegExp(
    `\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`,
    "gi"
  );
  return normalizeWhitespace(query.replace(pattern, " "));
}

function detectPhraseTags(
  query: string,
  phraseMap: Record<string, string>
): { tags: string[]; remainingQuery: string } {
  let remainingQuery = query;
  const tags: string[] = [];

  const phrases = Object.keys(phraseMap).sort((a, b) => b.length - a.length);

  for (const phrase of phrases) {
    const pattern = new RegExp(
      `\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`,
      "i"
    );

    if (!pattern.test(remainingQuery)) continue;

    tags.push(phraseMap[phrase]);
    remainingQuery = stripMatchedPhrase(remainingQuery, phrase);
  }

  return { tags, remainingQuery };
}

function detectWordTags(
  tokens: string[],
  wordMap: Record<string, string>
): { tags: string[]; textTokens: string[] } {
  const tags: string[] = [];
  const textTokens: string[] = [];

  for (const token of tokens) {
    const normalized = normalizeToken(token);
    if (!normalized) continue;

    const mappedTag = wordMap[normalized] || wordMap[token.toLowerCase()];
    if (mappedTag) {
      tags.push(mappedTag);
      continue;
    }

    textTokens.push(normalized);
  }

  return { tags, textTokens };
}

export function parseSearchQuery(rawQuery: string): ParsedSearchQuery {
  const raw = String(rawQuery ?? "");
  const normalizedInput = normalizeWhitespace(raw.toLowerCase());

  if (!normalizedInput) {
    return {
      rawQuery: raw,
      textTokens: [],
      emotionalTokens: [],
      worldTokens: [],
      normalizedText: "",
    };
  }

  const emotionalPhraseResult = detectPhraseTags(
    normalizedInput,
    PHRASE_EMOTIONAL_MAP
  );
  const worldPhraseResult = detectPhraseTags(
    emotionalPhraseResult.remainingQuery,
    PHRASE_WORLD_MAP
  );

  const remainingTokens = worldPhraseResult.remainingQuery
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const emotionalWordResult = detectWordTags(
    remainingTokens,
    EMOTIONAL_WORD_MAP
  );
  const worldWordResult = detectWordTags(
    emotionalWordResult.textTokens,
    WORLD_WORD_MAP
  );

  const emotionalTokens = uniqueTags([
    ...emotionalPhraseResult.tags,
    ...emotionalWordResult.tags,
  ]);
  const worldTokens = uniqueTags([
    ...worldPhraseResult.tags,
    ...worldWordResult.tags,
  ]);
  const textTokens = worldWordResult.textTokens;

  return {
    rawQuery: raw,
    textTokens,
    emotionalTokens,
    worldTokens,
    normalizedText: textTokens.join(" "),
  };
}
