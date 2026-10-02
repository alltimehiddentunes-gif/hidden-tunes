/**
 * Shared local-catalog discovery for Mood Rooms, Artist Radio, Hidden Radio,
 * and Smart Queue normalization primitives.
 *
 * Discovery-only: never mutates owner mood/genre/artist/tags metadata.
 */

export type RadioDiscoverySong = {
  id?: unknown;
  title?: unknown;
  artist?: unknown;
  artist_name?: unknown;
  album?: unknown;
  album_title?: unknown;
  genre?: unknown;
  mood?: unknown;
  moodGenre?: unknown;
  tags?: unknown;
  emotion?: unknown;
  streamUrl?: unknown;
  audioUrl?: unknown;
  url?: unknown;
  isOnline?: unknown;
  [key: string]: unknown;
};

export type RadioDiscoverySeeds = {
  artist?: string;
  title?: string;
  query?: string;
  genre?: string;
  mood?: string;
  artistId?: string;
};

export type RankedDiscoveryHit<T extends RadioDiscoverySong> = {
  song: T;
  score: number;
  signals: string[];
};

export type DiscoveryTrace = {
  catalogSize: number;
  playableCount: number;
  afterNormalization: number;
  afterFilter: number;
  finalCount: number;
  concepts: string[];
  zeroStage: string | null;
};

export type DiscoveryMatchKind = "exact" | "alias" | "phrase" | "typo" | "related";

export type ResolvedDiscoveryToken = {
  source: string;
  kind: DiscoveryMatchKind;
  concepts: string[];
};

/** Scoring priority: exact > alias > phrase > typo > related/fallback. */
export const DISCOVERY_SCORE = {
  exact: 12,
  alias: 9,
  phrase: 6,
  typo: 4,
  related: 2,
} as const;

const CONCEPT_ALIASES: Record<string, string[]> = {
  afro: ["afro", "afrobeats", "afrobeat", "afro beats", "afropop", "afro pop", "amapiano", "highlife"],
  afrobeat: ["afrobeat", "afrobeats", "afro beats", "afro", "afropop", "afro pop"],
  afrobeats: ["afrobeats", "afrobeat", "afro beats", "afro", "afropop", "afro pop"],
  party: ["party", "dance", "club", "energy", "party energy", "movement"],
  chill: ["chill", "chillhop", "lofi", "lo fi", "lo-fi", "relax", "calm", "smooth"],
  worship: ["worship", "gospel", "christian", "sacred", "sacred voices", "spiritual"],
  praise: ["praise", "gospel", "worship", "christian"],
  inspiration: ["inspiration", "inspirational", "uplift", "uplifting", "motivational", "spiritual"],
  intimacy: ["intimacy", "intimate", "soft intimacy", "romantic", "romance", "love"],
  spiritual: ["spiritual", "gospel", "worship", "praise", "sacred", "christian"],
  gospel: ["gospel", "worship", "praise", "spiritual", "christian", "sacred"],
  heartfelt: ["heartfelt", "emotional", "sincere", "tender", "soulful"],
  reflective: ["reflective", "reflection", "introspective", "thoughtful", "nostalgic"],
  nostalgic: ["nostalgic", "nostalgia", "reflective", "memory", "memories"],
  soulful: ["soulful", "soul", "heartfelt", "rnb", "r and b"],
  meditative: ["meditative", "meditation", "ambient", "calm", "serene", "grounded"],
  meditation: ["meditation", "meditative", "ambient", "calm", "serene", "grounded"],
  serene: ["serene", "calm", "peaceful", "ambient", "meditation", "meditative"],
  grounded: ["grounded", "calm", "centered", "meditation", "spiritual"],
  country: [
    "country",
    "americana",
    "bluegrass",
    "nashville",
    "country folk",
    "folk country",
    "honky tonk",
    "outlaw country",
  ],
  folk: ["folk", "americana", "acoustic folk", "folk country", "country folk"],
  rnb: ["rnb", "r and b", "rhythm and blues", "r b"],
  "hip hop": ["hip hop", "hiphop", "rap"],
  lofi: ["lofi", "lo fi", "chillhop"],
  "afro pop": ["afro pop", "afropop", "afro", "afrobeats", "afrobeat"],
};

/** Short tokens: exact/alias only — never fuzzy (meaning flips too easily). */
const SHORT_EXACT_ONLY = new Set([
  "rap",
  "pop",
  "rock",
  "soul",
  "jazz",
  "edm",
  "rnb",
  "folk",
  "funk",
  "punk",
  "trap",
  "dub",
  "ska",
]);

/** Generic app/query noise — never treated as discovery intent alone. */
const DISCOVERY_STOPWORDS = new Set([
  "hidden",
  "tune",
  "tunes",
  "radio",
  "song",
  "songs",
  "music",
  "track",
  "tracks",
  "audio",
]);

const MIN_FUZZY_LEN = 5;
const MIN_FUZZY_LEN_STRICT4 = 4; // allow unique dist-1 only (e.g. chll → chill)

/** Opaque placeholders — alphanumeric so punctuation splitting cannot tear them apart. */
const CANON_PLACEHOLDERS: Array<{ pattern: RegExp; token: string; concept: string }> = [
  { pattern: /\br\s*&\s*b\b/gi, token: "zzcanrnbzz", concept: "rnb" },
  { pattern: /\br\s*[+＆]\s*b\b/gi, token: "zzcanrnbzz", concept: "rnb" },
  { pattern: /\br\s+and\s+b\b/gi, token: "zzcanrnbzz", concept: "rnb" },
  { pattern: /\brnb\b/gi, token: "zzcanrnbzz", concept: "rnb" },
  { pattern: /\bhip[\s\-_.~]*hop\b/gi, token: "zzcanhiphopzz", concept: "hip hop" },
  { pattern: /\bhiphop\b/gi, token: "zzcanhiphopzz", concept: "hip hop" },
  { pattern: /\blo[\s\-_.~]*fi\b/gi, token: "zzcanlofizz", concept: "lofi" },
  { pattern: /\blofi\b/gi, token: "zzcanlofizz", concept: "lofi" },
  { pattern: /\bafro[\s\-_.~]*pop\b/gi, token: "zzcanafropopzz", concept: "afro pop" },
  { pattern: /\bafropop\b/gi, token: "zzcanafropopzz", concept: "afro pop" },
  { pattern: /\bafro[\s\-_.~]*beats?\b/gi, token: "zzcanafrobeatszz", concept: "afrobeats" },
];

const PLACEHOLDER_TO_CONCEPT = new Map(
  CANON_PLACEHOLDERS.map((entry) => [entry.token, entry.concept])
);

function text(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .trim()
    .toLocaleLowerCase("en-US");
}

function compactKey(value: string) {
  return text(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function recordingKey(song: RadioDiscoverySong) {
  const title = text(song.title).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const artist = text(song.artist || song.artist_name)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (title && artist) return `meta:${title}:${artist}`;
  const id = String(song.id || "").trim().toLowerCase();
  return id ? `id:${id}` : "";
}

function cleanSeed(value: unknown) {
  return String(value ?? "")
    .replace(/\s+radio$/i, "")
    .replace(/\s+songs$/i, "")
    .replace(/\s+music$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlayable(song: RadioDiscoverySong) {
  return (
    song.isOnline !== false &&
    Boolean(song.streamUrl || song.audioUrl || song.url)
  );
}

function singularize(token: string) {
  if (token.length <= 3) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.endsWith("s") && !token.endsWith("ss") && token !== "blues") {
    return token.slice(0, -1);
  }
  return token;
}

function protectCanonicalPhrases(input: string): string {
  let next = input;
  CANON_PLACEHOLDERS.forEach(({ pattern, token }) => {
    next = next.replace(pattern, ` ${token} `);
  });
  return next;
}

function restoreCanonicalToken(token: string): string {
  return PLACEHOLDER_TO_CONCEPT.get(token) || token;
}

/**
 * Discovery-only free-form tokenization.
 * Does NOT mutate raw owner metadata.
 */
export function splitDiscoveryConcepts(value: unknown): string[] {
  let raw = String(value ?? "");
  if (!raw.trim()) return [];

  raw = raw.normalize("NFKC");
  raw = raw
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035`´']/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"');

  raw = protectCanonicalPhrases(raw);
  raw = raw.normalize("NFD").replace(/\p{M}+/gu, "");
  raw = raw.toLocaleLowerCase("en-US");

  const parts = raw
    .split(/[^\p{L}\p{N}]+/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => restoreCanonicalToken(part))
    .map((part) =>
      part
        .split(/\s+/)
        .map(singularize)
        .join(" ")
        .trim()
    )
    .filter((part) => part.length >= 2);

  const seen = new Set<string>();
  const unique: string[] = [];
  parts.forEach((part) => {
    if (seen.has(part)) return;
    seen.add(part);
    unique.push(part);
  });
  return unique;
}

function expandConcept(concept: string): string[] {
  const key = concept.trim();
  if (!key) return [];
  const aliases =
    CONCEPT_ALIASES[key] ||
    CONCEPT_ALIASES[singularize(key)] ||
    CONCEPT_ALIASES[key.replace(/\s+/g, "")] ||
    [];
  return Array.from(
    new Set([key, singularize(key), ...aliases].map((item) => text(item)).filter(Boolean))
  );
}

function buildVocabulary(): {
  concepts: string[];
  compactToConcept: Map<string, string>;
  aliasToConcept: Map<string, string>;
} {
  const concepts = new Set<string>();
  const compactToConcept = new Map<string, string>();
  const aliasToConcept = new Map<string, string>();

  Object.entries(CONCEPT_ALIASES).forEach(([canonical, aliases]) => {
    const canon = text(canonical);
    concepts.add(canon);
    compactToConcept.set(compactKey(canon), canon);
    aliasToConcept.set(canon, canon);
    aliasToConcept.set(compactKey(canon), canon);
    aliases.forEach((alias) => {
      const normalized = text(alias);
      concepts.add(normalized);
      compactToConcept.set(compactKey(normalized), canon);
      aliasToConcept.set(normalized, canon);
      aliasToConcept.set(compactKey(normalized), canon);
    });
  });

  return {
    concepts: Array.from(concepts),
    compactToConcept,
    aliasToConcept,
  };
}

const VOCAB = buildVocabulary();
const resolveTokenCache = new Map<string, ResolvedDiscoveryToken>();

function maxEditDistance(len: number): number {
  if (len < MIN_FUZZY_LEN_STRICT4) return 0;
  if (len < MIN_FUZZY_LEN) return 1; // len === 4, unique-only enforced later
  if (len <= 7) return 1;
  return 2;
}

/** Bounded Levenshtein with early exit. */
export function discoveryEditDistance(left: string, right: string, maxDist: number): number {
  if (left === right) return 0;
  const a = left;
  const b = right;
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length];
}

/**
 * Resolve one free-form token to canonical discovery concepts.
 * Priority: exact canonical > known alias > conservative typo > unresolved.
 */
export function resolveDiscoveryToken(token: unknown): ResolvedDiscoveryToken {
  const source = text(token).replace(/\s+/g, " ").trim();
  if (!source) return { source: "", kind: "exact", concepts: [] };

  const cached = resolveTokenCache.get(source);
  if (cached) return cached;

  const compact = compactKey(source);
  const singular = singularize(source);
  const singularCompact = compactKey(singular);

  const exactCanon =
    VOCAB.aliasToConcept.get(source) ||
    VOCAB.aliasToConcept.get(singular) ||
    VOCAB.compactToConcept.get(compact) ||
    VOCAB.compactToConcept.get(singularCompact);

  if (exactCanon) {
    const isAlias = exactCanon !== source && exactCanon !== singular && compact !== compactKey(exactCanon);
    const kind: DiscoveryMatchKind =
      source === exactCanon || singular === exactCanon || compact === compactKey(exactCanon)
        ? "exact"
        : "alias";
    const resolved: ResolvedDiscoveryToken = {
      source,
      kind: isAlias ? "alias" : kind,
      concepts: expandConcept(exactCanon),
    };
    // Prefer alias label when source is a known alias spelling of the canon.
    if (source !== exactCanon && CONCEPT_ALIASES[exactCanon]?.some((alias) => text(alias) === source)) {
      resolved.kind = "alias";
    }
    resolveTokenCache.set(source, resolved);
    return resolved;
  }

  // Short-word safety: never fuzzy-match aggressive short genre tokens.
  if (SHORT_EXACT_ONLY.has(source) || SHORT_EXACT_ONLY.has(compact) || source.length < MIN_FUZZY_LEN_STRICT4) {
    const unresolved: ResolvedDiscoveryToken = { source, kind: "exact", concepts: [source] };
    resolveTokenCache.set(source, unresolved);
    return unresolved;
  }

  const maxDist = maxEditDistance(compact.length || source.length);
  if (maxDist <= 0) {
    const unresolved: ResolvedDiscoveryToken = { source, kind: "exact", concepts: [source] };
    resolveTokenCache.set(source, unresolved);
    return unresolved;
  }

  const candidates: Array<{ concept: string; dist: number }> = [];
  VOCAB.concepts.forEach((concept) => {
    const conceptCompact = compactKey(concept);
    if (SHORT_EXACT_ONLY.has(concept) || conceptCompact.length < MIN_FUZZY_LEN_STRICT4) return;
    if (Math.abs(conceptCompact.length - compact.length) > maxDist) return;
    const dist = discoveryEditDistance(compact, conceptCompact, maxDist);
    if (dist <= maxDist) candidates.push({ concept, dist });
  });

  candidates.sort((a, b) => a.dist - b.dist || a.concept.localeCompare(b.concept));
  const best = candidates[0];
  // For length-4 tokens, require a unique best distance-1 match.
  if (best && compact.length < MIN_FUZZY_LEN) {
    const ties = candidates.filter((entry) => entry.dist === best.dist);
    if (ties.length !== 1 || best.dist !== 1) {
      const unresolved: ResolvedDiscoveryToken = { source, kind: "exact", concepts: [source] };
      resolveTokenCache.set(source, unresolved);
      return unresolved;
    }
  }

  if (best) {
    const canon = VOCAB.aliasToConcept.get(best.concept) || best.concept;
    const resolved: ResolvedDiscoveryToken = {
      source,
      kind: "typo",
      concepts: expandConcept(canon),
    };
    resolveTokenCache.set(source, resolved);
    return resolved;
  }

  const unresolved: ResolvedDiscoveryToken = { source, kind: "exact", concepts: [source] };
  resolveTokenCache.set(source, unresolved);
  return unresolved;
}

/**
 * Normalize free-form owner/search text into canonical discovery concepts.
 * Applies punctuation tokenization, aliases, and conservative typo resolution.
 */
export function normalizeDiscoveryConcepts(value: unknown): string[] {
  const parts = splitDiscoveryConcepts(value);
  const expanded: string[] = [];
  const seen = new Set<string>();
  parts.forEach((part) => {
    const resolved = resolveDiscoveryToken(part);
    const concepts = resolved.concepts.length ? resolved.concepts : [part];
    concepts.forEach((alias) => {
      if (!alias || seen.has(alias)) return;
      seen.add(alias);
      expanded.push(alias);
    });
  });
  return expanded;
}

/** Conservative artist-name normalization for discovery fallback only (not identity merge). */
export function normalizeArtistDiscoveryName(value: unknown): string {
  return text(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .map(singularize)
    .join(" ");
}

type CatalogSongIndex = {
  tokens: Set<string>;
  tokenKinds: Map<string, DiscoveryMatchKind>;
  blob: string;
  artistNorm: string;
};

type CatalogDiscoveryIndex = {
  signature: string;
  bySongId: Map<string, CatalogSongIndex>;
};

let catalogIndexCache: CatalogDiscoveryIndex | null = null;

function catalogSignature(catalog: RadioDiscoverySong[]): string {
  if (!catalog.length) return "0";
  return `${catalog.length}:${String(catalog[0]?.id || "")}:${String(
    catalog[catalog.length - 1]?.id || ""
  )}`;
}

function indexSong(song: RadioDiscoverySong): CatalogSongIndex {
  const values = [
    song.genre,
    song.mood,
    song.moodGenre,
    song.emotion,
    song.album,
    song.album_title,
    ...(Array.isArray(song.tags) ? song.tags : [song.tags]),
  ];
  const tokens = new Set<string>();
  const tokenKinds = new Map<string, DiscoveryMatchKind>();

  values.forEach((value) => {
    splitDiscoveryConcepts(value).forEach((token) => {
      const resolved = resolveDiscoveryToken(token);
      const kind = resolved.kind === "typo" ? "typo" : resolved.kind;
      (resolved.concepts.length ? resolved.concepts : [token]).forEach((concept) => {
        tokens.add(concept);
        const prev = tokenKinds.get(concept);
        if (!prev || rankKind(kind) < rankKind(prev)) {
          tokenKinds.set(concept, kind === "exact" || kind === "alias" ? kind : "related");
        }
      });
    });
  });

  const tagText = Array.isArray(song.tags)
    ? song.tags.map((entry) => String(entry || "")).join(" ")
    : String(song.tags || "");

  return {
    tokens,
    tokenKinds,
    blob: text(
      [
        song.title,
        song.artist,
        song.artist_name,
        song.album,
        song.album_title,
        song.genre,
        song.mood,
        song.moodGenre,
        song.emotion,
        tagText,
      ].join(" ")
    ),
    artistNorm: normalizeArtistDiscoveryName(song.artist || song.artist_name),
  };
}

function rankKind(kind: DiscoveryMatchKind): number {
  switch (kind) {
    case "exact":
      return 0;
    case "alias":
      return 1;
    case "phrase":
      return 2;
    case "typo":
      return 3;
    default:
      return 4;
  }
}

function getCatalogDiscoveryIndex(catalog: RadioDiscoverySong[]): CatalogDiscoveryIndex {
  const signature = catalogSignature(catalog);
  if (catalogIndexCache?.signature === signature) return catalogIndexCache;

  const bySongId = new Map<string, CatalogSongIndex>();
  catalog.forEach((song, index) => {
    const id = String(song.id || `idx:${index}`);
    bySongId.set(id, indexSong(song));
  });

  catalogIndexCache = { signature, bySongId };
  return catalogIndexCache;
}

function artistMatch(candidateNorm: string, seedNorm: string) {
  if (!candidateNorm || !seedNorm) return false;
  if (candidateNorm === seedNorm) return true;
  if (candidateNorm.includes(seedNorm) || seedNorm.includes(candidateNorm)) return true;
  const seedTokens = seedNorm.split(/\s+/).filter((token) => token.length > 2);
  if (!seedTokens.length) return false;
  const hits = seedTokens.filter((token) => candidateNorm.includes(token)).length;
  return hits >= Math.ceil(seedTokens.length * 0.6);
}

export function extractRadioSeedArtist(seeds: RadioDiscoverySeeds): string {
  const direct = cleanSeed(seeds.artist);
  if (direct) return direct;
  const fromTitle = cleanSeed(seeds.title);
  if (fromTitle && !/^hidden\s+tunes$/i.test(fromTitle)) return fromTitle;
  return cleanSeed(seeds.query);
}

/**
 * Score a song against already-normalized query concepts.
 * Exact/alias field hits outrank phrase, which outranks typo-origin query concepts.
 */
export function scoreSongAgainstConcepts(
  song: RadioDiscoverySong,
  concepts: string[],
  options?: { queryTokenKinds?: Map<string, DiscoveryMatchKind>; index?: CatalogSongIndex }
): { score: number; signals: string[] } {
  if (!concepts.length) return { score: 0, signals: [] };

  const indexed = options?.index || indexSong(song);
  const signals: string[] = [];
  let score = 0;

  concepts.forEach((concept) => {
    const queryKind = options?.queryTokenKinds?.get(concept) || "exact";
    if (indexed.tokens.has(concept)) {
      const fieldKind = indexed.tokenKinds.get(concept) || "exact";
      if (fieldKind === "exact" && queryKind !== "typo") {
        score += DISCOVERY_SCORE.exact;
        signals.push(`exact:${concept}`);
        return;
      }
      if (fieldKind === "alias" || queryKind === "alias") {
        score += DISCOVERY_SCORE.alias;
        signals.push(`alias:${concept}`);
        return;
      }
      if (queryKind === "typo") {
        score += DISCOVERY_SCORE.typo;
        signals.push(`typo:${concept}`);
        return;
      }
      score += DISCOVERY_SCORE.related;
      signals.push(`related:${concept}`);
      return;
    }
    if (indexed.blob.includes(concept)) {
      const phraseScore =
        queryKind === "typo" ? DISCOVERY_SCORE.typo : DISCOVERY_SCORE.phrase;
      score += phraseScore;
      signals.push(`phrase:${concept}`);
    }
  });

  return { score, signals: Array.from(new Set(signals)) };
}

function dedupeRanked<T extends RadioDiscoverySong>(
  hits: RankedDiscoveryHit<T>[]
): RankedDiscoveryHit<T>[] {
  const seen = new Set<string>();
  const unique: RankedDiscoveryHit<T>[] = [];
  hits.forEach((hit) => {
    const key = recordingKey(hit.song);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(hit);
  });
  return unique;
}

function buildQueryConceptPlan(value: unknown): {
  concepts: string[];
  queryTokenKinds: Map<string, DiscoveryMatchKind>;
} {
  const parts = splitDiscoveryConcepts(value);
  const concepts: string[] = [];
  const seen = new Set<string>();
  const queryTokenKinds = new Map<string, DiscoveryMatchKind>();

  parts.forEach((part) => {
    if (DISCOVERY_STOPWORDS.has(part) || DISCOVERY_STOPWORDS.has(compactKey(part))) {
      return;
    }
    const resolved = resolveDiscoveryToken(part);
    const list = resolved.concepts.length ? resolved.concepts : [part];
    list.forEach((concept) => {
      if (!concept || DISCOVERY_STOPWORDS.has(concept)) return;
      const prev = queryTokenKinds.get(concept);
      if (!prev || rankKind(resolved.kind) < rankKind(prev)) {
        queryTokenKinds.set(concept, resolved.kind);
      }
      if (seen.has(concept)) return;
      seen.add(concept);
      concepts.push(concept);
    });
  });

  return { concepts, queryTokenKinds };
}

/**
 * Mood / multi-concept discovery: match ANY strong concept, rank by match strength.
 */
export function selectMoodCatalogCandidates<T extends RadioDiscoverySong>(
  catalog: T[],
  moodLabel: unknown,
  limit = 80
): { songs: T[]; ranked: RankedDiscoveryHit<T>[]; trace: DiscoveryTrace } {
  const plan = buildQueryConceptPlan(moodLabel);
  const playable = catalog.filter(isPlayable);
  const index = getCatalogDiscoveryIndex(catalog);
  const trace: DiscoveryTrace = {
    catalogSize: catalog.length,
    playableCount: playable.length,
    afterNormalization: plan.concepts.length,
    afterFilter: 0,
    finalCount: 0,
    concepts: plan.concepts,
    zeroStage: null,
  };

  if (!catalog.length) {
    trace.zeroStage = "empty_catalog";
    return { songs: [], ranked: [], trace };
  }
  if (!playable.length) {
    trace.zeroStage = "no_playable";
    return { songs: [], ranked: [], trace };
  }
  if (!plan.concepts.length) {
    trace.zeroStage = "no_concepts";
    return { songs: [], ranked: [], trace };
  }

  const rankedRaw: RankedDiscoveryHit<T>[] = [];
  playable.forEach((song, songIndex) => {
    const id = String(song.id || `idx:${songIndex}`);
    const songIndexData = index.bySongId.get(id);
    const scored = scoreSongAgainstConcepts(song, plan.concepts, {
      queryTokenKinds: plan.queryTokenKinds,
      index: songIndexData,
    });
    if (scored.score <= 0) return;
    rankedRaw.push({ song, score: scored.score, signals: scored.signals });
  });

  const ranked = dedupeRanked(rankedRaw).sort((left, right) =>
    right.score !== left.score
      ? right.score - left.score
      : String(left.song.id || "").localeCompare(String(right.song.id || ""))
  );

  trace.afterFilter = ranked.length;
  const songs = ranked.slice(0, limit).map((entry) => entry.song);
  trace.finalCount = songs.length;
  if (!songs.length) trace.zeroStage = "no_concept_matches";
  return { songs, ranked: ranked.slice(0, limit), trace };
}

/**
 * Local-first Artist / Hidden Radio candidate selection.
 * artistId (caller) > normalized artist name > genre/mood concepts > no random dump when seeded.
 */
export function selectRadioCatalogCandidates<T extends RadioDiscoverySong>(
  catalog: T[],
  seeds: RadioDiscoverySeeds,
  limit = 60
): T[] {
  const artistSeed = normalizeArtistDiscoveryName(extractRadioSeedArtist(seeds));
  const genrePlan = buildQueryConceptPlan(seeds.genre);
  const moodPlan = buildQueryConceptPlan(seeds.mood);
  const queryPlan = buildQueryConceptPlan(cleanSeed(seeds.query || seeds.title || ""));
  const allConcepts = Array.from(
    new Set([...genrePlan.concepts, ...moodPlan.concepts, ...queryPlan.concepts])
  );
  const queryTokenKinds = new Map<string, DiscoveryMatchKind>();
  [genrePlan, moodPlan, queryPlan].forEach((plan) => {
    plan.queryTokenKinds.forEach((kind, concept) => {
      const prev = queryTokenKinds.get(concept);
      if (!prev || rankKind(kind) < rankKind(prev)) queryTokenKinds.set(concept, kind);
    });
  });

  const index = getCatalogDiscoveryIndex(catalog);
  const sameArtist: RankedDiscoveryHit<T>[] = [];
  const conceptHits: RankedDiscoveryHit<T>[] = [];
  const rest: T[] = [];
  const seen = new Set<string>();

  catalog.forEach((song, songIndex) => {
    if (!isPlayable(song)) return;
    const key = recordingKey(song);
    if (!key || seen.has(key)) return;
    seen.add(key);

    const id = String(song.id || `idx:${songIndex}`);
    const songIndexData = index.bySongId.get(id);
    const songArtist = songIndexData?.artistNorm || normalizeArtistDiscoveryName(song.artist || song.artist_name);

    if (artistSeed && artistMatch(songArtist, artistSeed)) {
      sameArtist.push({
        song,
        score: 100,
        signals: [`artist:${artistSeed}`],
      });
      return;
    }

    const scored = scoreSongAgainstConcepts(song, allConcepts, {
      queryTokenKinds,
      index: songIndexData,
    });
    if (scored.score > 0) {
      conceptHits.push({
        song,
        score: scored.score,
        signals: scored.signals,
      });
      return;
    }
    rest.push(song);
  });

  sameArtist.sort((a, b) => b.score - a.score);
  conceptHits.sort((a, b) => b.score - a.score);
  const intent = [...sameArtist, ...conceptHits].map((entry) => entry.song);
  if (intent.length > 0) return intent.slice(0, limit);

  // Hidden Radio / unscoped only: diversified local sample — never when artist/genre seeded.
  if (!artistSeed && !allConcepts.length && rest.length > 0) {
    const diversified: T[] = [];
    const artistCounts = new Map<string, number>();
    for (const song of rest) {
      const name = normalizeArtistDiscoveryName(song.artist || song.artist_name) || "unknown";
      if ((artistCounts.get(name) || 0) >= 2) continue;
      diversified.push(song);
      artistCounts.set(name, (artistCounts.get(name) || 0) + 1);
      if (diversified.length >= limit) break;
    }
    return diversified.length ? diversified : rest.slice(0, limit);
  }

  return [];
}

/** Trace helper for audits / tests. */
export function traceRadioCatalogDiscovery<T extends RadioDiscoverySong>(
  catalog: T[],
  seeds: RadioDiscoverySeeds,
  limit = 60
): { songs: T[]; trace: DiscoveryTrace } {
  const playable = catalog.filter(isPlayable);
  const concepts = Array.from(
    new Set([
      ...normalizeDiscoveryConcepts(seeds.genre),
      ...normalizeDiscoveryConcepts(seeds.mood),
      ...normalizeDiscoveryConcepts(seeds.query || seeds.title || ""),
      ...normalizeDiscoveryConcepts(extractRadioSeedArtist(seeds)),
    ])
  );
  const songs = selectRadioCatalogCandidates(catalog, seeds, limit);
  const trace: DiscoveryTrace = {
    catalogSize: catalog.length,
    playableCount: playable.length,
    afterNormalization: concepts.length,
    afterFilter: songs.length,
    finalCount: songs.length,
    concepts,
    zeroStage: songs.length
      ? null
      : !catalog.length
        ? "empty_catalog"
        : !playable.length
          ? "no_playable"
          : "no_artist_or_concept_matches",
  };
  return { songs, trace };
}
