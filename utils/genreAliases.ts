/**
 * Premium 3-layer genre system (metadata in DB unchanged).
 *
 * Layer 1: visible core genres (UI / filters / ranking)
 * Layer 2: subgenre aliases (Afrobeat → Afrobeats, Rap → Hip-Hop, etc.)
 * Layer 3: mood tags (reserved — not exposed as main genres yet)
 */

export type CoreGenreDefinition = {
  id: string;
  title: string;
  aliases: string[];
};

const CORE_GENRE_DEFINITIONS: CoreGenreDefinition[] = [
  {
    id: "afrobeats",
    title: "Afrobeats",
    aliases: [
      "afrobeat",
      "afrobeats",
      "afro beat",
      "afro beats",
      "afro pop",
      "afropop",
      "afro-pop",
      "afro fusion",
      "afro soul",
      "alte",
      "highlife",
      "fuji",
      "juju",
      "bongo flava",
    ],
  },
  {
    id: "hip-hop",
    title: "Hip-Hop",
    aliases: [
      "hip hop",
      "hip-hop",
      "hiphop",
      "rap",
      "boom bap",
      "conscious rap",
      "melodic rap",
      "cloud rap",
      "gangsta rap",
    ],
  },
  {
    id: "rnb",
    title: "R&B",
    aliases: [
      "r&b",
      "rnb",
      "rhythm and blues",
      "contemporary r&b",
      "alt r&b",
      "alternative r&b",
    ],
  },
  {
    id: "soul",
    title: "Soul",
    aliases: ["soul", "neo soul", "neo-soul", "southern soul", "soul blues"],
  },
  {
    id: "gospel",
    title: "Gospel",
    aliases: [
      "gospel",
      "worship",
      "praise",
      "christian gospel",
      "urban gospel",
      "choir gospel",
      "contemporary gospel",
    ],
  },
  {
    id: "blues",
    title: "Blues",
    aliases: [
      "blues",
      "soul blues",
      "delta blues",
      "chicago blues",
      "electric blues",
    ],
  },
  {
    id: "jazz",
    title: "Jazz",
    aliases: [
      "jazz",
      "smooth jazz",
      "afro jazz",
      "afro-jazz",
      "vocal jazz",
      "bebop",
    ],
  },
  {
    id: "reggae",
    title: "Reggae",
    aliases: ["reggae", "roots reggae", "dub", "lovers rock"],
  },
  {
    id: "dancehall",
    title: "Dancehall",
    aliases: ["dancehall", "ragga", "bashment"],
  },
  {
    id: "amapiano",
    title: "Amapiano",
    aliases: [
      "amapiano",
      "piano",
      "private school amapiano",
      "afro piano",
      "afropiano",
    ],
  },
  {
    id: "house",
    title: "House",
    aliases: [
      "house",
      "deep house",
      "afro house",
      "tech house",
      "progressive house",
    ],
  },
  {
    id: "edm",
    title: "EDM",
    aliases: [
      "edm",
      "electronic",
      "electronic dance",
      "electronic dance music",
      "dance",
      "trance",
      "techno",
      "dubstep",
      "drum and bass",
      "dnb",
      "future bass",
      "garage",
    ],
  },
  {
    id: "pop",
    title: "Pop",
    aliases: [
      "pop",
      "popular",
      "dance pop",
      "synth pop",
      "electropop",
      "afro pop",
      "afropop",
    ],
  },
  {
    id: "rock",
    title: "Rock",
    aliases: [
      "rock",
      "classic rock",
      "soft rock",
      "indie rock",
      "alternative rock",
    ],
  },
  {
    id: "indie",
    title: "Indie",
    aliases: ["indie", "indie pop", "indie folk", "indie rock"],
  },
  {
    id: "alternative",
    title: "Alternative",
    aliases: [
      "alternative",
      "alt",
      "alt pop",
      "alternative pop",
      "alternative rock",
    ],
  },
  {
    id: "country",
    title: "Country",
    aliases: ["country", "country music", "country pop", "americana"],
  },
  {
    id: "latin",
    title: "Latin",
    aliases: [
      "latin",
      "latin pop",
      "reggaeton",
      "salsa",
      "bachata",
      "merengue",
    ],
  },
  {
    id: "classical",
    title: "Classical",
    aliases: ["classical", "orchestral", "piano classical", "chamber music"],
  },
  {
    id: "folk",
    title: "Folk",
    aliases: ["folk", "acoustic folk", "singer songwriter", "singer-songwriter"],
  },
  {
    id: "trap",
    title: "Trap",
    aliases: ["trap", "atl trap", "melodic trap"],
  },
  {
    id: "drill",
    title: "Drill",
    aliases: ["drill", "uk drill", "chicago drill", "afro drill"],
  },
  {
    id: "lo-fi",
    title: "Lo-Fi",
    aliases: ["lofi", "lo-fi", "lo fi", "chillhop", "study beats"],
  },
  {
    id: "ambient",
    title: "Ambient",
    aliases: ["ambient", "atmospheric", "meditation", "soundscape"],
  },
  {
    id: "instrumental",
    title: "Instrumental",
    aliases: ["instrumental", "beat", "beats", "score"],
  },
  {
    id: "acoustic",
    title: "Acoustic",
    aliases: ["acoustic", "unplugged", "acoustic pop"],
  },
  {
    id: "funk",
    title: "Funk",
    aliases: ["funk", "afro funk", "afrofunk", "funk soul"],
  },
  {
    id: "disco",
    title: "Disco",
    aliases: ["disco", "nu disco", "dance disco"],
  },
  {
    id: "soundtrack",
    title: "Soundtrack",
    aliases: [
      "soundtrack",
      "cinematic",
      "film score",
      "movie score",
      "tv score",
    ],
  },
];

/** Layer 3 — emotional tags (not shown as primary genre chips yet). */
const MOOD_TAGS = [
  "Midnight Soul",
  "Healing Music",
  "Rainy Night Blues",
  "Deep Reflection",
  "Lonely Roads",
  "Soft Intimacy",
  "Heartbreak Soul",
  "Spiritual Calm",
  "Dark Atmosphere",
  "Warm Vintage",
  "Sunset Drive",
  "Slow Burn",
  "Emotional Piano",
  "Cinematic Darkness",
  "Anxiety Relief",
  "Focus Flow",
  "Late Night Jazz",
  "Sacred Voices",
] as const;

const CORE_BY_TITLE = new Map<string, CoreGenreDefinition>();
const CORE_BY_ID = new Map<string, CoreGenreDefinition>();
const ALIAS_TO_CORE_TITLES = new Map<string, Set<string>>();

function registerAlias(alias: string, coreTitle: string) {
  const key = normalizeGenreKey(alias);
  if (!key) return;

  const existing = ALIAS_TO_CORE_TITLES.get(key) || new Set<string>();
  existing.add(coreTitle);
  ALIAS_TO_CORE_TITLES.set(key, existing);
}

CORE_GENRE_DEFINITIONS.forEach((core) => {
  CORE_BY_TITLE.set(core.title, core);
  CORE_BY_ID.set(core.id, core);
  registerAlias(core.title, core.title);
  core.aliases.forEach((alias) => registerAlias(alias, core.title));
});

export function normalizeGenreKey(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularizeToken(token: string) {
  if (token.length <= 3) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.endsWith("s") && !token.endsWith("ss") && token !== "blues") {
    return token.slice(0, -1);
  }
  return token;
}

function getComparableGenreKeys(value: unknown): string[] {
  const text = normalizeGenreKey(value);
  if (!text) return [];

  const singularText = text
    .split(" ")
    .map(singularizeToken)
    .join(" ");

  return Array.from(
    new Set([
      text,
      text.replace(/\s+/g, ""),
      singularText,
      singularText.replace(/\s+/g, ""),
    ])
  ).filter(Boolean);
}

function findCoreDefinition(value: unknown): CoreGenreDefinition | null {
  const titles = getCanonicalGenres(value);
  if (!titles.length) return null;
  return CORE_BY_TITLE.get(titles[0]) || null;
}

/** All canonical core titles matching a raw genre string (supports shared aliases). */
export function getCanonicalGenres(value: unknown): string[] {
  const found = new Set<string>();

  getComparableGenreKeys(value).forEach((key) => {
    ALIAS_TO_CORE_TITLES.get(key)?.forEach((title) => found.add(title));
  });

  return Array.from(found);
}

/** Primary display core genre for a raw value (first stable match). */
export function getCanonicalGenre(value: unknown): string | null {
  const matches = getCanonicalGenres(value);
  return matches[0] || null;
}

/** All alias strings for a core genre (includes title + subgenre aliases). */
export function getGenreAliases(value: unknown): string[] {
  const cores = getCanonicalGenres(value);
  const targets = cores.length
    ? cores
    : [String(value || "").trim()].filter(Boolean);

  const merged = new Set<string>();

  targets.forEach((title) => {
    const core = CORE_BY_TITLE.get(title);
    if (!core) {
      merged.add(title);
      return;
    }

    merged.add(core.title);
    core.aliases.forEach((alias) => merged.add(alias));
  });

  return Array.from(merged);
}

export function genreMatches(songGenre: unknown, selectedGenre: unknown): boolean {
  const songValue = String(songGenre || "").trim();
  const selectedValue = String(selectedGenre || "").trim();

  if (!songValue || !selectedValue) return false;

  const selectedCores = getCanonicalGenres(selectedValue);
  const songCores = getCanonicalGenres(songValue);

  if (
    selectedCores.length &&
    songCores.some((core) => selectedCores.includes(core))
  ) {
    return true;
  }

  const songKeys = getComparableGenreKeys(songValue);
  const aliasKeys = getGenreAliases(selectedValue).flatMap(getComparableGenreKeys);

  return aliasKeys.some((aliasKey) =>
    songKeys.some((songKey) => {
      if (!aliasKey || !songKey) return false;
      if (aliasKey === songKey) return true;
      if (aliasKey.length <= 3 || songKey.length <= 3) return false;
      return songKey.includes(aliasKey) || aliasKey.includes(songKey);
    })
  );
}

export function genreListMatches(
  songGenres: unknown[],
  selectedGenre: unknown
): boolean {
  const values = (Array.isArray(songGenres) ? songGenres : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  if (!values.length) return false;

  return values.some((genre) => genreMatches(genre, selectedGenre));
}

export function getVisibleCoreGenres(): CoreGenreDefinition[] {
  return CORE_GENRE_DEFINITIONS.map((core) => ({
    id: core.id,
    title: core.title,
    aliases: [...core.aliases],
  }));
}

export function getMoodTags(): readonly string[] {
  return MOOD_TAGS;
}

export function getCoreGenreById(id: string): CoreGenreDefinition | null {
  return CORE_BY_ID.get(id) || null;
}

export function getCoreGenreByTitle(title: string): CoreGenreDefinition | null {
  return CORE_BY_TITLE.get(title) || findCoreDefinition(title);
}
