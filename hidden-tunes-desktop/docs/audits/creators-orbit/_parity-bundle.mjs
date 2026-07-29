// src/lib/audioVersions.ts
var AUDIO_QUALITY_FALLBACKS = {
  auto: [
    "ultraLight",
    "previewUrl",
    "standard",
    "legacyAudioUrl",
    "highQuality",
    "lossless"
  ],
  "data-saver": ["ultraLight", "previewUrl", "standard", "legacyAudioUrl"],
  standard: ["standard", "ultraLight", "previewUrl", "legacyAudioUrl", "highQuality"],
  "high-quality": [
    "highQuality",
    "standard",
    "legacyAudioUrl",
    "ultraLight",
    "previewUrl",
    "lossless"
  ]
};
function asHttpUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("ht-download://")) return trimmed;
  return null;
}
function selectInstantPlayableUrl(songOrMetadata) {
  return selectPlayableUrlForQualityMode(songOrMetadata, "auto");
}
function selectPlayableUrlForQualityMode(songOrMetadata, qualityMode) {
  const versions = songOrMetadata.audioVersions;
  const candidatesByTier = {
    ultraLight: { tier: "ultraLight", url: versions?.ultraLight?.url },
    previewUrl: { tier: "previewUrl", url: songOrMetadata.previewUrl },
    standard: { tier: "standard", url: versions?.standard?.url },
    legacyAudioUrl: { tier: "legacyAudioUrl", url: songOrMetadata.audioUrl },
    highQuality: { tier: "highQuality", url: versions?.highQuality?.url },
    lossless: { tier: "lossless", url: versions?.lossless?.url }
  };
  const seen = /* @__PURE__ */ new Set();
  for (const tier of AUDIO_QUALITY_FALLBACKS[qualityMode]) {
    const candidate = candidatesByTier[tier];
    const url = asHttpUrl(candidate.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    return { url, tier: candidate.tier };
  }
  return null;
}

// src/lib/catalogDisplayText.ts
var MOJIBAKE_RE = /(?:Ã.|Â.|â€.|â€™|â€œ|â€˜|├[âó]|┬.|Ô[Çé]|Ôé¼|�|ï¿½)/;
var GENERIC_ALBUM_TITLES = /* @__PURE__ */ new Set(["singles", "album", "unknown album", "untitled album", "untitled"]);
function isMojibakeText(value) {
  if (typeof value !== "string") return false;
  return MOJIBAKE_RE.test(value);
}
function normalizeCatalogDisplayText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (isMojibakeText(trimmed)) return null;
  if (/^\[object\s/i.test(trimmed)) return null;
  return trimmed;
}
function isGenericAlbumTitle(value) {
  const cleaned = normalizeCatalogDisplayText(value);
  if (!cleaned) return true;
  return GENERIC_ALBUM_TITLES.has(cleaned.toLowerCase());
}
function formatSongCountLabel(count, options) {
  if (count == null || !Number.isFinite(count) || count < 0) return null;
  const omitZero = options?.omitZero !== false;
  if (omitZero && count === 0) return null;
  const noun = options?.noun ?? "song";
  const rounded = Math.floor(count);
  return `${rounded} ${rounded === 1 ? noun : `${noun}s`}`;
}

// src/lib/config/desktopRuntimeConfig.ts
var DEV_EXPRESS_DEFAULT = "https://hidden-tunes-api.onrender.com";
var DEV_ADMIN_DEFAULT = "https://admin.hiddentunes.com";
var PRODUCTION_EXPRESS_ALLOWLIST = /* @__PURE__ */ new Set([
  "api.hiddentunes.com",
  "hidden-tunes-api.onrender.com"
]);
var PRODUCTION_ADMIN_ALLOWLIST = /* @__PURE__ */ new Set(["admin.hiddentunes.com"]);
var LOCALHOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i;
function readEnv(env, keys) {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
function stripTrailingSlash(url) {
  return url.replace(/\/+$/, "");
}
function parseHttpsUrl(raw, options) {
  if (!raw) return { ok: false, reason: "missing" };
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "https-required" };
  }
  if (!options.allowLocalhost && LOCALHOST_RE.test(parsed.hostname)) {
    return { ok: false, reason: "localhost-forbidden" };
  }
  return {
    ok: true,
    url: stripTrailingSlash(parsed.toString()),
    hostname: parsed.hostname
  };
}
function detectPackaged(input) {
  if (typeof input.isPackaged === "boolean") return input.isPackaged;
  if (input.runtimeBridge && typeof input.runtimeBridge.isPackaged === "boolean") {
    return input.runtimeBridge.isPackaged;
  }
  try {
    if (typeof window !== "undefined" && window.location?.protocol === "file:") {
      return true;
    }
  } catch {
  }
  return false;
}
function detectDev(input, isPackaged) {
  if (typeof input.isDev === "boolean") return input.isDev;
  if (isPackaged) return false;
  try {
    return Boolean(false);
  } catch {
    return !isPackaged;
  }
}
function collectPublicEnv(input) {
  if (input.env) return input.env;
  try {
    return import.meta.env || {};
  } catch {
    return {};
  }
}
function resolveDesktopRuntimeConfig(input = {}) {
  const isPackaged = detectPackaged(input);
  const isDev = detectDev(input, isPackaged);
  const environment = isPackaged ? "production" : isDev ? "development" : "unknown";
  const env = collectPublicEnv(input);
  const errors = [];
  const warnings = [];
  const expressRaw = readEnv(env, ["VITE_EXPRESS_CATALOG_API_URL"]);
  const adminRaw = readEnv(env, [
    "VITE_CATALOG_ADMIN_API_URL",
    "HT_CATALOG_ADMIN_API_URL"
  ]);
  const supabaseUrlRaw = readEnv(env, [
    "VITE_SUPABASE_URL",
    "VITE_PUBLIC_SUPABASE_URL"
  ]);
  const supabaseAnonRaw = readEnv(env, [
    "VITE_SUPABASE_ANON_KEY",
    "VITE_PUBLIC_SUPABASE_ANON_KEY"
  ]);
  if (supabaseAnonRaw && /service[_-]?role/i.test(supabaseAnonRaw)) {
    errors.push("Supabase service-role keys are not allowed in the desktop client.");
  }
  let expressCatalogBaseUrl = null;
  let adminCatalogBaseUrl = null;
  if (isPackaged) {
    const expressParsed = parseHttpsUrl(expressRaw, { allowLocalhost: false });
    if (!expressParsed.ok) {
      errors.push(
        expressParsed.reason === "missing" ? "Packaged build requires VITE_EXPRESS_CATALOG_API_URL." : `Express catalog URL invalid (${expressParsed.reason}).`
      );
    } else if (!PRODUCTION_EXPRESS_ALLOWLIST.has(expressParsed.hostname)) {
      errors.push(`Express catalog host is not allowlisted: ${expressParsed.hostname}`);
    } else {
      expressCatalogBaseUrl = expressParsed.url;
    }
    const adminCandidate = adminRaw || DEV_ADMIN_DEFAULT;
    const adminParsed = parseHttpsUrl(adminCandidate, { allowLocalhost: false });
    if (!adminParsed.ok) {
      errors.push(`Admin catalog URL invalid (${adminParsed.reason}).`);
    } else if (!PRODUCTION_ADMIN_ALLOWLIST.has(adminParsed.hostname)) {
      errors.push(`Admin catalog host is not allowlisted: ${adminParsed.hostname}`);
    } else {
      adminCatalogBaseUrl = adminParsed.url;
      if (!adminRaw) {
        warnings.push("Admin catalog URL used production default admin.hiddentunes.com.");
      }
    }
  } else {
    const expressCandidate = expressRaw || DEV_EXPRESS_DEFAULT;
    const expressParsed = parseHttpsUrl(expressCandidate, { allowLocalhost: true });
    if (!expressParsed.ok) {
      errors.push(`Express catalog URL invalid (${expressParsed.reason}).`);
    } else {
      expressCatalogBaseUrl = expressParsed.url;
      if (!expressRaw) {
        warnings.push("Development Express catalog default in use (Render).");
      }
    }
    const adminCandidate = adminRaw || DEV_ADMIN_DEFAULT;
    const adminParsed = parseHttpsUrl(adminCandidate, { allowLocalhost: true });
    if (!adminParsed.ok) {
      errors.push(`Admin catalog URL invalid (${adminParsed.reason}).`);
    } else {
      adminCatalogBaseUrl = adminParsed.url;
    }
  }
  let supabaseUrl = null;
  let supabaseAnonKey = null;
  if (supabaseUrlRaw) {
    const parsed = parseHttpsUrl(supabaseUrlRaw, { allowLocalhost: !isPackaged });
    if (!parsed.ok) {
      warnings.push(`Supabase URL ignored (${parsed.reason}).`);
    } else {
      supabaseUrl = parsed.url;
    }
  }
  if (supabaseAnonRaw && !errors.some((e) => e.includes("service-role"))) {
    supabaseAnonKey = supabaseAnonRaw;
  }
  const leakedSports = readEnv(env, ["HT_SPORTS_PRIVATE_PILOT_TOKEN"]) || (isPackaged ? readEnv(env, ["VITE_SPORTS_PRIVATE_PILOT_TOKEN"]) : null);
  if (leakedSports && isPackaged) {
    warnings.push(
      "Sports private pilot token must stay main-process only (ignored by renderer config)."
    );
  }
  return {
    environment,
    isPackaged,
    isDev,
    expressCatalogBaseUrl,
    adminCatalogBaseUrl,
    supabaseUrl,
    supabaseAnonKey,
    errors,
    warnings,
    ok: errors.length === 0 && Boolean(expressCatalogBaseUrl) && Boolean(adminCatalogBaseUrl)
  };
}
var cachedConfig = null;
function getDesktopRuntimeConfig(force = false) {
  if (!force && cachedConfig) return cachedConfig;
  let runtimeBridge = null;
  try {
    if (typeof window !== "undefined") {
      runtimeBridge = window.hiddenTunesDesktop?.runtime?.getInfo?.() ?? null;
    }
  } catch {
    runtimeBridge = null;
  }
  cachedConfig = resolveDesktopRuntimeConfig({ runtimeBridge });
  return cachedConfig;
}
function getExpressCatalogBaseUrlOrThrow() {
  const config = getDesktopRuntimeConfig();
  if (!config.expressCatalogBaseUrl) {
    throw new Error(
      config.errors[0] || "Music catalog API is not configured for this desktop build."
    );
  }
  return config.expressCatalogBaseUrl;
}

// src/lib/musicCatalog/types.ts
var MUSIC_CATALOG_CACHE_TTL_MS = 1e3 * 60 * 60 * 6;

// src/lib/api.ts
var API_BASE_URL = (() => {
  try {
    return getExpressCatalogBaseUrlOrThrow();
  } catch {
    return "";
  }
})();
function sortSongsList(songs, sort) {
  const list = [...songs];
  if (sort === "az") {
    return list.sort((a, b) => a.title.localeCompare(b.title));
  }
  return list.sort((a, b) => {
    const bTime = Date.parse(b.createdAt || "") || 0;
    const aTime = Date.parse(a.createdAt || "") || 0;
    return bTime - aTime;
  });
}

// src/lib/catalogDiagnostics.ts
var PREFIX = "[ht-catalog]";
function shouldLog() {
  return false;
}
function logArtistResolve(stats) {
  if (!shouldLog()) return;
  console.info(`${PREFIX} artist resolve`, stats);
}
function logAlbumResolve(stats) {
  if (!shouldLog()) return;
  console.info(`${PREFIX} album resolve`, stats);
}

// src/lib/catalogIndexes.ts
function normalizeArtistKey(value) {
  return value.trim().toLowerCase();
}
function normalizeAlbumKey(value) {
  return value.trim().toLowerCase();
}
function albumArtistFallbackKey(albumTitle, artistId) {
  return `${normalizeAlbumKey(albumTitle)}::artist::${artistId}`;
}
function dedupeSongsById(songs) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const song of songs) {
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    result.push(song);
  }
  return result;
}
function songBelongsToArtist(song, artist) {
  if (artist.id && song.artistId) {
    return song.artistId === artist.id;
  }
  return normalizeArtistKey(song.artist) === normalizeArtistKey(artist.name);
}
function songBelongsToAlbum(song, album, artistNames) {
  if (album.id && song.albumId) {
    return song.albumId === album.id;
  }
  if (normalizeAlbumKey(song.album) !== normalizeAlbumKey(album.title)) {
    return false;
  }
  if (!album.artistId) {
    return false;
  }
  if (song.artistId) {
    return song.artistId === album.artistId;
  }
  const albumArtistName = artistNames.get(album.artistId);
  if (!albumArtistName) {
    return false;
  }
  return normalizeArtistKey(song.artist) === normalizeArtistKey(albumArtistName);
}
function strictFilterSongsForArtist(songs, artist) {
  return dedupeSongsById(songs.filter((song) => songBelongsToArtist(song, artist)));
}
function strictFilterSongsForAlbum(songs, album, artistNames) {
  return dedupeSongsById(songs.filter((song) => songBelongsToAlbum(song, album, artistNames)));
}
function resolveSongsForArtist(artist, songsByArtistId, songsByArtistName) {
  const started = performance.now();
  if (artist.id) {
    const byId = songsByArtistId.get(artist.id);
    if (byId?.length) {
      const result = strictFilterSongsForArtist(byId, artist);
      if (result.length > 0) {
        logArtistResolve({
          artistId: artist.id,
          resultCount: result.length,
          durationMs: Math.round(performance.now() - started),
          source: "id"
        });
        return result;
      }
    }
  }
  const byName = songsByArtistName.get(normalizeArtistKey(artist.name));
  if (byName?.length) {
    const result = strictFilterSongsForArtist(byName, artist);
    if (result.length > 0) {
      logArtistResolve({
        artistId: artist.id,
        resultCount: result.length,
        durationMs: Math.round(performance.now() - started),
        source: "name"
      });
      return result;
    }
  }
  const tracks = strictFilterSongsForArtist(artist.tracks ?? [], artist);
  logArtistResolve({
    artistId: artist.id,
    resultCount: tracks.length,
    durationMs: Math.round(performance.now() - started),
    source: tracks.length > 0 ? "tracks" : "none"
  });
  return tracks;
}
function resolveAlbumDisplayArtist(album, albumSongs, artistNames) {
  if (album.artistId) {
    const linked = artistNames.get(album.artistId);
    if (linked) return linked;
  }
  if (albumSongs.length === 0) return null;
  const counts = /* @__PURE__ */ new Map();
  for (const song of albumSongs) {
    const name = song.artist.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let bestName = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      bestName = name;
      bestCount = count;
    }
  }
  return bestName;
}
function resolveAlbumArtwork(album, albumSongs) {
  if (album.artwork) return album.artwork;
  for (const song of albumSongs) {
    if (song.artwork) return song.artwork;
  }
  return null;
}
function resolveSongsForAlbum(album, songsByAlbumId, songsByAlbumName, artistNames) {
  const started = performance.now();
  if (album.id) {
    const byId = songsByAlbumId.get(album.id);
    if (byId?.length) {
      const result2 = strictFilterSongsForAlbum(byId, album, artistNames);
      if (result2.length > 0) {
        logAlbumResolve({
          albumId: album.id,
          resultCount: result2.length,
          durationMs: Math.round(performance.now() - started),
          source: "id"
        });
        return result2;
      }
    }
  }
  if (!album.artistId) {
    logAlbumResolve({
      albumId: album.id,
      resultCount: 0,
      durationMs: Math.round(performance.now() - started),
      source: "none"
    });
    return [];
  }
  const scopedFallback = songsByAlbumName.get(
    albumArtistFallbackKey(album.title, album.artistId)
  ) ?? [];
  const result = strictFilterSongsForAlbum(scopedFallback, album, artistNames);
  logAlbumResolve({
    albumId: album.id,
    resultCount: result.length,
    durationMs: Math.round(performance.now() - started),
    source: result.length > 0 ? "name" : "none"
  });
  return result;
}

// src/lib/devAudioVersionTestHarness.ts
var DEV_TEST_AUDIO_URL_BASE = "https://example.com/hidden-tunes-dev-audio";
var DEV_AUDIO_VERSION_ID_PREFIX = "dev-audio-version-";
var DEV_AUDIO_VERSION_TAG = "desktop-dev";
function devSong(overrides) {
  return {
    ...overrides,
    id: overrides.id,
    title: overrides.title,
    artist: "Hidden Tunes QA",
    artistId: null,
    album: "Desktop Audio Version Harness",
    albumId: null,
    genre: "Diagnostics",
    mood: "Focus",
    tags: [DEV_AUDIO_VERSION_TAG, "audio-versions"],
    description: "Developer-only desktop test object for audio version UI.",
    artwork: null,
    previewUrl: null,
    audioUrl: null,
    highQualityUrl: null,
    audioVersions: void 0,
    durationSeconds: 42,
    createdAt: "2026-06-13T00:00:00.000Z"
  };
}
var DEV_AUDIO_VERSION_TEST_SONGS = [
  devSong({
    id: "dev-audio-version-full",
    title: "DEV Audio Versions: All Tiers",
    previewUrl: `${DEV_TEST_AUDIO_URL_BASE}/full-preview.mp3`,
    audioUrl: `${DEV_TEST_AUDIO_URL_BASE}/full-legacy.mp3`,
    highQualityUrl: `${DEV_TEST_AUDIO_URL_BASE}/full-high.mp3`,
    audioVersions: {
      ultraLight: { url: `${DEV_TEST_AUDIO_URL_BASE}/full-ultra.mp3` },
      standard: { url: `${DEV_TEST_AUDIO_URL_BASE}/full-standard.mp3` },
      highQuality: { url: `${DEV_TEST_AUDIO_URL_BASE}/full-high.mp3` },
      lossless: { url: `${DEV_TEST_AUDIO_URL_BASE}/full-lossless.flac` }
    }
  }),
  devSong({
    id: "dev-audio-version-lean",
    title: "DEV Audio Versions: Ultra + Standard",
    previewUrl: `${DEV_TEST_AUDIO_URL_BASE}/lean-preview.mp3`,
    audioUrl: `${DEV_TEST_AUDIO_URL_BASE}/lean-legacy.mp3`,
    audioVersions: {
      ultraLight: { url: `${DEV_TEST_AUDIO_URL_BASE}/lean-ultra.mp3` },
      standard: { url: `${DEV_TEST_AUDIO_URL_BASE}/lean-standard.mp3` }
    }
  }),
  devSong({
    id: "dev-audio-version-high-only",
    title: "DEV Audio Versions: High Quality Only",
    audioUrl: `${DEV_TEST_AUDIO_URL_BASE}/high-legacy.mp3`,
    highQualityUrl: `${DEV_TEST_AUDIO_URL_BASE}/high-only.mp3`,
    audioVersions: {
      highQuality: { url: `${DEV_TEST_AUDIO_URL_BASE}/high-only.mp3` }
    }
  }),
  devSong({
    id: "dev-audio-version-legacy-only",
    title: "DEV Audio Versions: Legacy Only",
    audioUrl: `${DEV_TEST_AUDIO_URL_BASE}/legacy-only.mp3`
  })
];
function isInternalDevCatalogSong(song) {
  const id = String(song.id || "");
  if (id.startsWith(DEV_AUDIO_VERSION_ID_PREFIX)) return true;
  const tags = song.tags;
  return Array.isArray(tags) && tags.includes(DEV_AUDIO_VERSION_TAG);
}
function excludeInternalDevCatalogSongs(songs) {
  return songs.filter((song) => !isInternalDevCatalogSong(song));
}

// src/lib/home/musicHomeSections.ts
var GENRE_LABELS = {
  "hidden-tunes": "Hidden Tunes",
  country: "Country",
  jazz: "Jazz",
  acoustic: "Acoustic",
  gospel: "Gospel",
  amapiano: "Amapiano",
  pop: "Pop",
  ambient: "Ambient",
  love: "Love & Soul"
};
function formatGenreLabel(genreId) {
  const normalized = genreId.trim().toLowerCase();
  if (GENRE_LABELS[normalized]) return GENRE_LABELS[normalized];
  return normalized.split(/[-_\s]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

// src/lib/home/mobileHomeParity.ts
var HOME_SECTION_PREVIEW_LIMIT = 8;
var HOME_CATALOG_PAGE_SIZE = 31;
var HOME_UI = {
  searchLauncher: "Search Hidden Tunes...",
  loadMore: "Load More",
  emptyTitle: "Nothing here yet",
  emptyCatalogMessage: "Your listening room is getting ready. Pull down to refresh when you're online.",
  refreshCatalog: "Refresh catalog",
  listening: {
    nowPlaying: "Now Playing",
    nothingPlaying: "Nothing playing yet",
    tapToStart: "Tap a song to start listening"
  },
  hero: {
    nowPlaying: "NOW PLAYING",
    featured: "FEATURED",
    pick: "PICK",
    recentlyPlayed: "RECENTLY PLAYED",
    nowPlayingFallback: "Now playing",
    editorPick: "Editor pick",
    genreSpotlight: "Genre spotlight",
    inRotation: "In rotation",
    play: "PLAY",
    openPlayer: "OPEN PLAYER"
  },
  signals: {
    curatedRooms: "Curated rooms"
  },
  sections: {
    forYourMood: "FOR YOUR MOOD",
    moodRooms: "Mood Rooms",
    new: "NEW",
    recentlyAdded: "Recently Added",
    play: "Play",
    listener: "LISTENER",
    becauseYouListened: "Because You Listened",
    next: "NEXT",
    smartMusicQueue: "Smart Music Queue",
    creators: "CREATORS",
    creatorsInOrbit: "Creators In Your Orbit",
    collections: "COLLECTIONS",
    albumsWorthStaying: "Albums Worth Staying With",
    rooms: "ROOMS",
    openRooms: "Open Rooms",
    genres: "GENRES",
    moodGenreSpotlights: "Genre Spotlights",
    madeForYou: "Made for you",
    fullCatalog: "FULL CATALOG",
    allSongs: "All Songs",
    seeAll: "See all"
  },
  recentlyAddedEmpty: "Your newest picks will appear here after the catalog loads.",
  shortcuts: {
    radio: "Radio",
    podcasts: "Podcasts",
    audiobooks: "Audiobooks",
    more: "More"
  },
  emotionalWorlds: {
    title: "Emotional Worlds",
    subtitle: "Hidden Tunes rooms shaped by mood and feeling"
  },
  rooms: {
    healing: "Healing",
    lateNight: "Late Night",
    calm: "Calm",
    energy: "Energy",
    calmInstrumentals: "Calm Instrumentals",
    nightDrive: "Night Drive",
    worshipFocus: "Worship Focus",
    healingRoom: "Healing Room"
  }
};
var EMOTIONAL_WORLD_CHIPS = [
  { id: "heartbreak", title: "Heartbreak", query: "heartbreak emotional music" },
  { id: "healing", title: "Healing", query: "healing calm music" },
  { id: "late-night", title: "Late Night", query: "late night mood music" },
  { id: "focus", title: "Focus", query: "focus concentration music" },
  { id: "party-energy", title: "Party Energy", query: "party energy dance music" },
  { id: "romantic", title: "Romantic", query: "romantic love songs" },
  { id: "nostalgic", title: "Nostalgic", query: "nostalgic throwback music" },
  { id: "calm", title: "Calm", query: "calm relaxing music" },
  { id: "deep-feelings", title: "Deep Feelings", query: "deep emotional music" },
  { id: "hidden-gems", title: "Hidden Gems", query: "hidden gems underrated songs" }
];
function songText(song) {
  return [song.title, song.artist, song.album, song.genre, song.mood].filter(Boolean).join(" ").toLowerCase();
}
function uniqSongs(songs) {
  const seen = /* @__PURE__ */ new Set();
  return songs.filter((song) => {
    const id = String(song.id || `${song.artist}-${song.title}`);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
function pickBestArtwork(songs) {
  return songs.find((song) => Boolean(song.artwork))?.artwork ?? null;
}
function buildMatchedGroup(id, title, terms, songs) {
  const matches = songs.filter((song) => {
    const text = songText(song);
    return terms.some((term) => text.includes(term.toLowerCase()));
  });
  const groupSongs = uniqSongs(matches).slice(0, 18);
  if (!groupSongs.length) return null;
  return {
    id,
    title,
    subtitle: `${groupSongs.length} song${groupSongs.length === 1 ? "" : "s"}`,
    artwork: pickBestArtwork(groupSongs) ?? groupSongs[0]?.artwork ?? null,
    songs: groupSongs
  };
}
function buildMoodRooms(songs) {
  return [
    buildMatchedGroup("healing", HOME_UI.rooms.healing, ["healing", "heal", "restore", "worship", "prayer", "peace"], songs),
    buildMatchedGroup("late-night", HOME_UI.rooms.lateNight, ["late", "night", "midnight", "after dark", "drive"], songs),
    buildMatchedGroup("calm", HOME_UI.rooms.calm, ["calm", "soft", "peace", "ambient", "quiet", "instrumental"], songs),
    buildMatchedGroup("energy", HOME_UI.rooms.energy, ["energy", "dance", "party", "afro", "beat", "upbeat"], songs)
  ].filter((room) => Boolean(room));
}
function buildOpenRooms(songs) {
  return [
    buildMatchedGroup("calm-instrumentals", HOME_UI.rooms.calmInstrumentals, ["instrumental", "calm", "ambient"], songs),
    buildMatchedGroup("night-drive", HOME_UI.rooms.nightDrive, ["night", "drive", "late", "midnight"], songs),
    buildMatchedGroup("worship-focus", HOME_UI.rooms.worshipFocus, ["worship", "gospel", "prayer", "jesus", "praise"], songs),
    buildMatchedGroup("healing-room", HOME_UI.rooms.healingRoom, ["healing", "heal", "restore", "peace"], songs)
  ].filter((room) => Boolean(room));
}
function buildRecentlyAddedSongs(songs, limit = HOME_SECTION_PREVIEW_LIMIT) {
  return sortSongsList(songs, "latest").slice(0, limit);
}
function buildBecauseYouListenedSongs(songs, history, songsById, limit = HOME_SECTION_PREVIEW_LIMIT) {
  const recentArtists = /* @__PURE__ */ new Set();
  for (const entry of history.slice(0, 24)) {
    const song = songsById.get(entry.songId);
    const artist = song?.artist?.trim().toLowerCase();
    if (artist) recentArtists.add(artist);
  }
  const candidates = songs.filter((song) => recentArtists.has(song.artist.trim().toLowerCase()));
  return uniqSongs(candidates.length ? candidates : songs.slice(8, 24)).slice(0, limit);
}
function buildSmartMusicQueueSongs(activeQueue, songs, limit = HOME_SECTION_PREVIEW_LIMIT) {
  return uniqSongs((activeQueue.length ? activeQueue : songs.slice(12, 30)).filter(Boolean)).slice(
    0,
    limit
  );
}
function resolvePlayableSongsForCreator(artist, indexes) {
  const associated = excludeInternalDevCatalogSongs(
    resolveSongsForArtist(artist, indexes.songsByArtistId, indexes.songsByArtistName)
  );
  return associated.filter((song) => Boolean(selectInstantPlayableUrl(song)));
}
function buildCreatorsInOrbit(artists, indexes, history = [], limit = HOME_SECTION_PREVIEW_LIMIT) {
  const affinity = /* @__PURE__ */ new Map();
  for (const entry of history) {
    const song = indexes.songsById.get(entry.songId);
    if (!song) continue;
    if (song.artistId) {
      const idKey = `id:${song.artistId}`;
      affinity.set(idKey, (affinity.get(idKey) ?? 0) + 2);
    }
    const nameKey = normalizeArtistKey(song.artist);
    if (nameKey) {
      const key = `name:${nameKey}`;
      affinity.set(key, (affinity.get(key) ?? 0) + 1);
    }
  }
  const eligible = [];
  for (const artist of artists) {
    const name = artist.name?.trim();
    if (!artist.id || !name) continue;
    const playable = resolvePlayableSongsForCreator(artist, indexes);
    if (playable.length === 0) continue;
    const nameKey = normalizeArtistKey(name);
    const personalisationScore = (affinity.get(`id:${artist.id}`) ?? 0) + (affinity.get(`name:${nameKey}`) ?? 0) + Math.min(playable.length, 40);
    eligible.push({
      artist,
      playableSongCount: playable.length,
      personalisationScore
    });
  }
  const byName = /* @__PURE__ */ new Map();
  for (const card of eligible) {
    const key = normalizeArtistKey(card.artist.name);
    const existing = byName.get(key);
    if (!existing || card.personalisationScore > existing.personalisationScore || card.personalisationScore === existing.personalisationScore && card.playableSongCount > existing.playableSongCount) {
      byName.set(key, card);
    }
  }
  return [...byName.values()].sort(
    (a, b) => b.personalisationScore - a.personalisationScore || a.artist.name.localeCompare(b.artist.name)
  ).slice(0, limit);
}
var NON_MUSIC_ALBUM_TITLES = /* @__PURE__ */ new Set(["podcast", "podcasts", "episode", "episodes"]);
function resolveHomeAlbumContentType(album, playableTrackCount) {
  const title = normalizeCatalogDisplayText(album.title) ?? "";
  const lower = title.toLowerCase();
  const release = normalizeCatalogDisplayText(album.releaseType)?.toLowerCase() ?? "";
  if (release.includes("playlist") || /\bplaylist\b/i.test(title)) {
    return { type: "playlist", label: "Playlist" };
  }
  if (release.includes("podcast") || NON_MUSIC_ALBUM_TITLES.has(lower)) {
    return { type: "podcast", label: "Podcast" };
  }
  if (release.includes("collection") || /\b(collection|mix|mixtape)\b/i.test(title)) {
    return { type: "collection", label: "Collection" };
  }
  if (release === "single" || lower === "single") {
    return { type: "single", label: "Single" };
  }
  if (lower === "singles" || release === "singles") {
    return {
      type: playableTrackCount <= 1 ? "single" : "singles",
      label: playableTrackCount <= 1 ? "Single" : "Singles"
    };
  }
  if (isGenericAlbumTitle(title)) {
    if (playableTrackCount <= 1) return { type: "single", label: "Single" };
    return { type: "album", label: null };
  }
  if (playableTrackCount <= 1) return { type: "single", label: null };
  return { type: "album", label: null };
}
function resolvePlayableSongsForAlbum(album, indexes) {
  const associated = excludeInternalDevCatalogSongs(
    resolveSongsForAlbum(
      album,
      indexes.songsByAlbumId,
      indexes.songsByAlbumName,
      indexes.artistNames
    )
  );
  return associated.filter((song) => Boolean(selectInstantPlayableUrl(song)));
}
function scoreAlbumWorthCard(card) {
  const namedBonus = isGenericAlbumTitle(card.rawTitle) ? 0 : 120;
  const multiTrackBonus = card.playableTrackCount >= 2 ? 40 : 0;
  const singlesPenalty = card.contentType === "singles" || card.contentType === "single" ? 8 : 0;
  return namedBonus + multiTrackBonus + card.playableTrackCount * 3 - singlesPenalty;
}
function buildAlbumsWorthStayingWith(albums, indexes, artistNames, limit = HOME_SECTION_PREVIEW_LIMIT) {
  if (!indexes?.songsByAlbumId || !indexes?.songsByAlbumName) return [];
  const resolvedArtistNames = artistNames ?? indexes.artistNames ?? /* @__PURE__ */ new Map();
  const cards = [];
  for (const album of albums) {
    if (!album?.id) continue;
    const rawTitle = normalizeCatalogDisplayText(album.title) ?? album.title ?? "";
    if (NON_MUSIC_ALBUM_TITLES.has(rawTitle.toLowerCase())) continue;
    const playableTracks = resolvePlayableSongsForAlbum(album, {
      songsByAlbumId: indexes.songsByAlbumId,
      songsByAlbumName: indexes.songsByAlbumName,
      artistNames: resolvedArtistNames
    });
    if (playableTracks.length === 0) continue;
    const artistName = normalizeCatalogDisplayText(
      resolveAlbumDisplayArtist(album, playableTracks, resolvedArtistNames)
    ) ?? null;
    const { type, label } = resolveHomeAlbumContentType(album, playableTracks.length);
    const genericTitle = isGenericAlbumTitle(rawTitle);
    const trackLabel = formatSongCountLabel(playableTracks.length, {
      noun: "track",
      omitZero: true
    });
    const displayTitle = genericTitle ? artistName || rawTitle || "Untitled" : rawTitle;
    const displaySubtitle = genericTitle ? [label, trackLabel].filter(Boolean).join(" \xB7 ") || null : artistName;
    cards.push({
      album,
      playableTracks,
      trackCount: playableTracks.length,
      playableTrackCount: playableTracks.length,
      artistName,
      contentType: type,
      contentTypeLabel: genericTitle ? null : label,
      displayTitle,
      displaySubtitle: displaySubtitle || null,
      artwork: resolveAlbumArtwork(album, playableTracks),
      rawTitle,
      sourceType: "album"
    });
  }
  return cards.sort((a, b) => scoreAlbumWorthCard(b) - scoreAlbumWorthCard(a)).slice(0, limit);
}
function songsReadyLabel(count) {
  return `${count.toLocaleString()}+ songs ready`;
}
function buildHomeHeroCards(songs, currentSong, recentHead) {
  const featuredSongs = songs.slice(0, 8);
  const primary = featuredSongs[0] || songs[0];
  const pick = featuredSongs[1] || featuredSongs[0];
  const genreSong = featuredSongs.find((song) => song.genre) || songs.find((song) => song.genre);
  const cards = [];
  if (currentSong && primary) {
    const match = songs.find((song) => String(song.id) === String(currentSong.id)) || primary;
    cards.push({
      key: `current-${match.id}`,
      label: HOME_UI.hero.nowPlaying,
      title: currentSong.title || match.title || HOME_UI.hero.nowPlayingFallback,
      subtitle: currentSong.artist || match.artist || "Hidden Tunes",
      song: match,
      isCurrent: true
    });
  }
  if (primary) {
    cards.push({
      key: `featured-${primary.id}`,
      label: HOME_UI.hero.featured,
      title: primary.title,
      subtitle: primary.artist || "Hidden Tunes",
      song: primary
    });
  }
  if (pick && String(pick.id) !== String(primary?.id)) {
    cards.push({
      key: `pick-${pick.id}`,
      label: HOME_UI.hero.pick,
      title: pick.title,
      subtitle: pick.artist || HOME_UI.hero.editorPick,
      song: pick
    });
  }
  if (genreSong) {
    cards.push({
      key: `genre-${genreSong.id}`,
      label: String(genreSong.genre || "GENRE").toUpperCase(),
      title: genreSong.title,
      subtitle: genreSong.artist || HOME_UI.hero.genreSpotlight,
      song: genreSong
    });
  }
  if (recentHead) {
    const recentSong = songs.find((song) => String(song.id) === String(recentHead.id)) || primary;
    if (recentSong) {
      cards.push({
        key: `recent-${recentSong.id}`,
        label: HOME_UI.hero.recentlyPlayed,
        title: recentHead.title || recentSong.title,
        subtitle: recentHead.artist || recentSong.artist || HOME_UI.hero.inRotation,
        song: recentSong
      });
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const seenSongIds = /* @__PURE__ */ new Set();
  return cards.filter((card) => {
    if (seen.has(card.key)) return false;
    const songId = String(card.song.id || "");
    if (songId && seenSongIds.has(songId)) return false;
    seen.add(card.key);
    if (songId) seenSongIds.add(songId);
    return true;
  }).slice(0, 6);
}
function buildGenreSpotlightCards(indexes, history, limit = HOME_SECTION_PREVIEW_LIMIT) {
  const preferred = /* @__PURE__ */ new Map();
  for (const entry of history) {
    const song = indexes.songsById.get(entry.songId);
    if (!song?.genre) continue;
    const key = song.genre.trim().toLowerCase();
    preferred.set(key, (preferred.get(key) ?? 0) + 2);
  }
  const cards = [];
  for (const [genre, genreSongs] of indexes.songsByGenre.entries()) {
    if (genreSongs.length < 2) continue;
    const weight = (preferred.get(genre) ?? 0) + Math.min(genreSongs.length, 40);
    cards.push({
      id: genre,
      label: formatGenreLabel(genre),
      count: genreSongs.length,
      artworkUrl: genreSongs.find((song) => song.artwork)?.artwork ?? null,
      songs: genreSongs.slice(0, 18),
      weight
    });
  }
  cards.sort((a, b) => b.weight - a.weight);
  return {
    cards: cards.slice(0, limit).map(({ id, label, count, artworkUrl, songs }) => ({
      id,
      label,
      count,
      artworkUrl,
      songs
    })),
    personalized: preferred.size > 0
  };
}
export {
  EMOTIONAL_WORLD_CHIPS,
  HOME_CATALOG_PAGE_SIZE,
  HOME_SECTION_PREVIEW_LIMIT,
  HOME_UI,
  buildAlbumsWorthStayingWith,
  buildBecauseYouListenedSongs,
  buildCreatorsInOrbit,
  buildGenreSpotlightCards,
  buildHomeHeroCards,
  buildMoodRooms,
  buildOpenRooms,
  buildRecentlyAddedSongs,
  buildSmartMusicQueueSongs,
  resolveHomeAlbumContentType,
  songsReadyLabel
};
