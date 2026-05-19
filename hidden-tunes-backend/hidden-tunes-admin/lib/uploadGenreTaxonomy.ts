export type UploadSubgenre = {
  id: string;
  label: string;
  slug: string;
  aliases?: string[];
};

export type UploadMainGenre = {
  id: string;
  label: string;
  slug: string;
  aliases?: string[];
  subgenres: UploadSubgenre[];
};

export type NormalizedGenrePayload = {
  genre: string;
  displayLabel: string;
  mainGenre: string;
  subGenre: string;
  genreSlug: string;
  mainGenreId: string;
  subgenreId: string;
};

const UPLOAD_MAIN_GENRES: UploadMainGenre[] = [
  {
    id: "afrobeats",
    label: "Afrobeats",
    slug: "afrobeats",
    aliases: ["Afrobeat", "Afrobeats", "Afropop", "Afro-pop"],
    subgenres: [
      { id: "afrobeats-core", label: "Afrobeats", slug: "afrobeats", aliases: ["Afrobeats", "Afrobeat"] },
      { id: "afropop", label: "Afropop", slug: "afropop", aliases: ["Afropop", "Afro-pop"] },
      { id: "gospel-afrobeat", label: "Gospel Afrobeat", slug: "gospel-afrobeat" },
      { id: "afro-soul", label: "Afro Soul", slug: "afro-soul" },
    ],
  },
  {
    id: "amapiano",
    label: "Amapiano",
    slug: "amapiano",
    aliases: ["Amapiano", "Ama Piano"],
    subgenres: [
      { id: "amapiano-core", label: "Amapiano", slug: "amapiano" },
      { id: "amapiano-vocal", label: "Amapiano Vocal", slug: "amapiano-vocal" },
      { id: "amapiano-instrumental", label: "Amapiano Instrumental", slug: "amapiano-instrumental" },
    ],
  },
  {
    id: "gospel-worship",
    label: "Gospel / Worship",
    slug: "gospel-worship",
    aliases: ["Gospel", "Worship", "Christian", "African Gospel"],
    subgenres: [
      { id: "gospel-worship-core", label: "Gospel / Worship", slug: "gospel-worship" },
      { id: "worship", label: "Worship", slug: "worship" },
      { id: "gospel", label: "Gospel", slug: "gospel" },
    ],
  },
  {
    id: "hip-hop-rap",
    label: "Hip-Hop / Rap",
    slug: "hip-hop-rap",
    aliases: ["Hip Hop", "Hiphop", "Hip-Hop", "Rap"],
    subgenres: [
      { id: "hip-hop-rap-core", label: "Hip-Hop / Rap", slug: "hip-hop-rap" },
      { id: "hip-hop", label: "Hip-Hop", slug: "hip-hop" },
      { id: "rap", label: "Rap", slug: "rap" },
    ],
  },
  {
    id: "rnb-soul",
    label: "R&B / Soul",
    slug: "rnb-soul",
    aliases: ["R&B", "RnB", "R and B", "Soul"],
    subgenres: [
      { id: "rnb-soul-core", label: "R&B / Soul", slug: "rnb-soul" },
      { id: "rnb", label: "R&B", slug: "rnb", aliases: ["RnB"] },
      { id: "soul", label: "Soul", slug: "soul" },
    ],
  },
  {
    id: "reggae-dancehall",
    label: "Reggae / Dancehall",
    slug: "reggae-dancehall",
    aliases: ["Reggae", "Dancehall", "Dance Hall"],
    subgenres: [
      { id: "reggae-dancehall-core", label: "Reggae / Dancehall", slug: "reggae-dancehall" },
      { id: "reggae", label: "Reggae", slug: "reggae" },
      { id: "dancehall", label: "Dancehall", slug: "dancehall" },
    ],
  },
  {
    id: "highlife",
    label: "Highlife",
    slug: "highlife",
    aliases: ["Highlife", "Hi-Life"],
    subgenres: [
      { id: "highlife-core", label: "Highlife", slug: "highlife" },
      { id: "hi-life", label: "Hi-Life", slug: "hi-life" },
    ],
  },
  {
    id: "soul-blues",
    label: "Soul Blues",
    slug: "soul-blues",
    aliases: ["Soul Blues", "Blues"],
    subgenres: [
      { id: "soul-blues-core", label: "Soul Blues", slug: "soul-blues" },
      { id: "blues", label: "Blues", slug: "blues" },
    ],
  },
  {
    id: "lo-fi",
    label: "Lo-fi",
    slug: "lo-fi",
    aliases: ["Lo-fi", "Lofi", "Lo Fi"],
    subgenres: [
      { id: "lo-fi-core", label: "Lo-fi", slug: "lo-fi" },
      { id: "chill-lofi", label: "Chill Lo-fi", slug: "chill-lofi" },
    ],
  },
  {
    id: "jazz",
    label: "Jazz",
    slug: "jazz",
    subgenres: [{ id: "jazz-core", label: "Jazz", slug: "jazz" }],
  },
  {
    id: "pop",
    label: "Pop",
    slug: "pop",
    subgenres: [{ id: "pop-core", label: "Pop", slug: "pop" }],
  },
  {
    id: "rock",
    label: "Rock",
    slug: "rock",
    subgenres: [{ id: "rock-core", label: "Rock", slug: "rock" }],
  },
  {
    id: "country",
    label: "Country",
    slug: "country",
    subgenres: [{ id: "country-core", label: "Country", slug: "country" }],
  },
  {
    id: "instrumental",
    label: "Instrumental",
    slug: "instrumental",
    subgenres: [{ id: "instrumental-core", label: "Instrumental", slug: "instrumental" }],
  },
  {
    id: "electronic",
    label: "Electronic",
    slug: "electronic",
    aliases: ["Electronic", "EDM", "House", "Techno", "Dance"],
    subgenres: [
      { id: "electronic-core", label: "Electronic", slug: "electronic" },
      { id: "edm", label: "EDM", slug: "edm" },
      { id: "house", label: "House", slug: "house" },
    ],
  },
  {
    id: "afro-house",
    label: "Afro House",
    slug: "afro-house",
    aliases: ["Afro House", "Afrohouse"],
    subgenres: [{ id: "afro-house-core", label: "Afro House", slug: "afro-house" }],
  },
  {
    id: "traditional-folk",
    label: "Traditional / Folk",
    slug: "traditional-folk",
    aliases: ["Traditional", "Folk", "World"],
    subgenres: [
      { id: "traditional-folk-core", label: "Traditional / Folk", slug: "traditional-folk" },
      { id: "folk", label: "Folk", slug: "folk" },
      { id: "world", label: "World", slug: "world" },
    ],
  },
  {
    id: "uncategorized",
    label: "Uncategorized",
    slug: "uncategorized",
    aliases: ["Uncategorized", "Other", "Unknown"],
    subgenres: [{ id: "uncategorized-core", label: "Uncategorized", slug: "uncategorized" }],
  },
];

const MAIN_GENRE_LOOKUP = new Map<string, UploadMainGenre>();
const SUBGENRE_LOOKUP = new Map<string, { main: UploadMainGenre; subgenre: UploadSubgenre }>();
const LABEL_LOOKUP = new Map<string, { mainGenreId: string; subgenreId: string }>();

function normalizeKey(value: unknown) {
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

function slugify(value: string) {
  return normalizeKey(value).replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
}

function registerLabelKeys(keys: string[], mainGenreId: string, subgenreId: string) {
  keys.forEach((key) => {
    if (!key) return;
    if (!LABEL_LOOKUP.has(key)) {
      LABEL_LOOKUP.set(key, { mainGenreId, subgenreId });
    }
  });
}

UPLOAD_MAIN_GENRES.forEach((mainGenre) => {
  MAIN_GENRE_LOOKUP.set(mainGenre.id, mainGenre);
  registerLabelKeys(
    [normalizeKey(mainGenre.id), normalizeKey(mainGenre.label), normalizeKey(mainGenre.slug)],
    mainGenre.id,
    mainGenre.subgenres[0]?.id || `${mainGenre.id}-core`
  );

  mainGenre.aliases?.forEach((alias) => {
    registerLabelKeys([normalizeKey(alias)], mainGenre.id, mainGenre.subgenres[0]?.id || `${mainGenre.id}-core`);
  });

  mainGenre.subgenres.forEach((subgenre) => {
    SUBGENRE_LOOKUP.set(subgenre.id, { main: mainGenre, subgenre });
    registerLabelKeys(
      [
        normalizeKey(subgenre.id),
        normalizeKey(subgenre.label),
        normalizeKey(subgenre.slug),
        `${normalizeKey(mainGenre.label)} ${normalizeKey(subgenre.label)}`,
      ],
      mainGenre.id,
      subgenre.id
    );

    subgenre.aliases?.forEach((alias) => {
      registerLabelKeys([normalizeKey(alias)], mainGenre.id, subgenre.id);
    });
  });
});

export function getUploadMainGenres() {
  return UPLOAD_MAIN_GENRES.filter((genre) => genre.id !== "uncategorized");
}

export function getUploadSubgenres(mainGenreId: string) {
  return MAIN_GENRE_LOOKUP.get(mainGenreId)?.subgenres || [];
}

export function getDefaultMainGenreId() {
  return "afrobeats";
}

export function getDefaultSubgenreId(mainGenreId = getDefaultMainGenreId()) {
  return getUploadSubgenres(mainGenreId)[0]?.id || `${mainGenreId}-core`;
}

export function buildNormalizedGenrePayload(input: {
  mainGenreId?: string;
  subgenreId?: string;
}): NormalizedGenrePayload | null {
  const mainGenreId = String(input.mainGenreId || "").trim();
  const subgenreId = String(input.subgenreId || "").trim();

  if (!mainGenreId || !subgenreId) return null;

  const mainGenre = MAIN_GENRE_LOOKUP.get(mainGenreId);
  const subgenreEntry = SUBGENRE_LOOKUP.get(subgenreId);

  if (!mainGenre || !subgenreEntry || subgenreEntry.main.id !== mainGenre.id) {
    return null;
  }

  const subGenre = subgenreEntry.subgenre.label;
  const displayLabel = subGenre;

  return {
    genre: subGenre,
    displayLabel,
    mainGenre: mainGenre.label,
    subGenre,
    genreSlug: subgenreEntry.subgenre.slug,
    mainGenreId: mainGenre.id,
    subgenreId: subgenreEntry.subgenre.id,
  };
}

export function inferGenreSelectionFromLabel(label: unknown) {
  const key = normalizeKey(label);
  if (!key) return null;

  const direct = LABEL_LOOKUP.get(key);
  if (direct) return direct;

  const slug = slugify(String(label || ""));
  const slugMatch = LABEL_LOOKUP.get(slug);
  if (slugMatch) return slugMatch;

  for (const [lookupKey, value] of LABEL_LOOKUP.entries()) {
    if (lookupKey.length <= 3) continue;
    if (key.includes(lookupKey) || lookupKey.includes(key)) {
      return value;
    }
  }

  return null;
}

export function normalizeIncomingGenrePayload(body: {
  mainGenreId?: unknown;
  subgenreId?: unknown;
  mainGenre?: unknown;
  subGenre?: unknown;
  genreSlug?: unknown;
  genre?: unknown;
  defaultGenre?: unknown;
}) {
  const structured = buildNormalizedGenrePayload({
    mainGenreId: String(body.mainGenreId || ""),
    subgenreId: String(body.subgenreId || ""),
  });

  if (structured) return structured;

  const inferred = inferGenreSelectionFromLabel(
    body.genre || body.defaultGenre || body.subGenre || body.mainGenre
  );

  if (inferred) {
    const payload = buildNormalizedGenrePayload(inferred);
    if (payload) return payload;
  }

  const fallbackLabel = String(body.genre || body.defaultGenre || "Uncategorized").trim();

  return {
    genre: fallbackLabel || "Uncategorized",
    displayLabel: fallbackLabel || "Uncategorized",
    mainGenre: String(body.mainGenre || "Uncategorized").trim() || "Uncategorized",
    subGenre: String(body.subGenre || fallbackLabel || "Uncategorized").trim() || "Uncategorized",
    genreSlug: String(body.genreSlug || slugify(fallbackLabel) || "uncategorized"),
    mainGenreId: "uncategorized",
    subgenreId: "uncategorized-core",
  };
}

export const SONGS_EXTENDED_GENRE_COLUMNS_ENABLED =
  process.env.SONGS_EXTENDED_GENRE_COLUMNS === "true";

export function applyNormalizedGenreToSongInsert(
  base: Record<string, unknown>,
  payload: NormalizedGenrePayload
) {
  const next: Record<string, unknown> = {
    ...base,
    genre: payload.genre,
  };

  if (SONGS_EXTENDED_GENRE_COLUMNS_ENABLED) {
    next.main_genre = payload.mainGenre;
    next.sub_genre = payload.subGenre;
    next.genre_slug = payload.genreSlug;
    next.genre_display = payload.displayLabel;
  }

  return next;
}
