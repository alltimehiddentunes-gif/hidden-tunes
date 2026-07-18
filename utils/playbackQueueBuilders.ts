import type { PlaybackQueueContext } from "../context/PlayerContext";
import { getDiscoveryPlayableSongs } from "../services/hiddenTunes";
import {
  buildCatalogTarget,
  matchSongsForCatalogTarget,
  type CatalogResolverType,
} from "./catalogResolver";
import { getDiscoveryPreferredGenres } from "./discoveryPreferences";

export type QueueBuildSong = {
  id: string;
  title?: string;
  artist?: string;
  user?: { name?: string };
  channelTitle?: string;
  album?: string;
  albumId?: string;
  genre?: string;
  mood?: string;
  streamUrl?: string;
  url?: string;
  audioUrl?: string;
  audio_url?: string;
  type?: string;
  source?: string;
  sourceName?: string;
  isYouTube?: boolean;
};

export type QueueBuildResult = {
  queue: QueueBuildSong[];
  activeIndex: number;
  builtFrom: string;
  expanded: boolean;
  diagnostics: Record<string, unknown>;
};

function text(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function normalizeAlbumText(value: unknown) {
  return lower(value).replace(/\s+/g, " ").trim();
}

function getPlayableUri(song: QueueBuildSong) {
  const possible =
    song.streamUrl || song.url || song.audioUrl || song.audio_url || "";
  const clean = text(possible);
  return clean.length > 0 ? clean : null;
}

function isYouTubeSong(song: QueueBuildSong) {
  return (
    song.type === "youtube_video" ||
    song.source === "youtube" ||
    song.sourceName === "YouTube" ||
    Boolean((song as { videoId?: string }).videoId)
  );
}

function isPlayableSong(song: QueueBuildSong) {
  return Boolean(getPlayableUri(song)) && !isYouTubeSong(song);
}

/** Motivationals metadata queue entries intentionally lack stream URLs until resolve-on-demand. */
function isMotivationDomainSong(song: QueueBuildSong) {
  const id = text(song.id);
  if (id.startsWith("motivation-item-")) return true;
  return lower(song.sourceName) === "motivationals";
}

function isMotivationQueueContext(context: PlaybackQueueContext) {
  const typed = context as PlaybackQueueContext & {
    queueType?: string;
    contextType?: string;
  };
  if (typed.queueType === "motivation") return true;
  if (context.source === "motivation") return true;
  if (lower(context.label) === "motivationals") return true;
  return false;
}

/** Lectures sessions: active row is playable; siblings are metadata-only until resolve. */
function isEducationalDomainSong(song: QueueBuildSong) {
  const id = text(song.id);
  if (id.startsWith("lecture-session-")) return true;
  return lower(song.sourceName) === "lectures";
}

function isEducationalQueueContext(context: PlaybackQueueContext) {
  const typed = context as PlaybackQueueContext & {
    queueType?: string;
    contextType?: string;
  };
  if (typed.queueType === "educational") return true;
  if (typed.contextType === "educational-program") return true;
  return false;
}

function preserveStrictDomainQueue(input: {
  seed: QueueBuildSong;
  providedQueue?: QueueBuildSong[];
  requestedIndex?: number;
  isDomainSong: (song: QueueBuildSong) => boolean;
  builtFrom: string;
  diagnostics: Record<string, unknown>;
}): QueueBuildResult {
  const domainProvided = dedupeSongs(
    (input.providedQueue || []).filter((entry) => !isYouTubeSong(entry))
  );
  const placed = ensureSongInQueue(
    domainProvided.length
      ? domainProvided
      : input.isDomainSong(input.seed)
        ? [input.seed]
        : [],
    input.seed
  );
  const activeIndex =
    input.requestedIndex === undefined
      ? placed.activeIndex
      : Math.max(0, Math.min(input.requestedIndex, placed.queue.length - 1));

  return {
    queue: placed.queue,
    activeIndex,
    builtFrom: input.builtFrom,
    expanded: false,
    diagnostics: {
      ...input.diagnostics,
      provided_length: domainProvided.length,
      final_length: placed.queue.length,
      foreign_item_count: 0,
      expanded: false,
    },
  };
}

function songArtist(song: QueueBuildSong) {
  return lower(song.artist || song.user?.name || song.channelTitle);
}

function songAlbum(song: QueueBuildSong) {
  const raw = song as {
    album?: string;
    albumName?: string;
    album_name?: string;
    releaseTitle?: string;
    release_title?: string;
  };
  return normalizeAlbumText(
    raw.album || raw.albumName || raw.album_name || raw.releaseTitle || raw.release_title
  );
}

function songGenre(song: QueueBuildSong) {
  return lower(song.genre);
}

function songMood(song: QueueBuildSong) {
  return lower(song.mood);
}

function dedupeSongs(songs: QueueBuildSong[]) {
  const seen = new Set<string>();
  const out: QueueBuildSong[] = [];
  for (const song of songs) {
    const id = text(song.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(song);
  }
  return out;
}

function ensureSongInQueue(queue: QueueBuildSong[], song: QueueBuildSong) {
  const merged = dedupeSongs(queue);
  const index = merged.findIndex((item) => item.id === song.id);
  if (index >= 0) {
    return { queue: merged, activeIndex: index };
  }
  return { queue: dedupeSongs([song, ...merged]), activeIndex: 0 };
}

function getCatalogPlayable() {
  return dedupeSongs(getDiscoveryPlayableSongs().filter(isPlayableSong));
}

function albumMatches(song: QueueBuildSong, context: PlaybackQueueContext, seed: QueueBuildSong) {
  const albumId = lower(context.albumId || seed.albumId);
  const albumTitle = normalizeAlbumText(context.albumTitle || seed.album);
  if (albumId && lower(song.albumId) && lower(song.albumId) === albumId) return true;
  if (albumTitle && songAlbum(song) && songAlbum(song) === albumTitle) return true;
  return false;
}

function artistMatches(song: QueueBuildSong, context: PlaybackQueueContext, seed: QueueBuildSong) {
  const artistName = lower(context.artistName || seed.artist);
  return Boolean(artistName && songArtist(song) && songArtist(song) === artistName);
}

function genreMatches(song: QueueBuildSong, context: PlaybackQueueContext, seed: QueueBuildSong) {
  const genreName = lower(context.genre || seed.genre);
  return Boolean(genreName && songGenre(song) && songGenre(song) === genreName);
}

function moodMatches(song: QueueBuildSong, context: PlaybackQueueContext, seed: QueueBuildSong) {
  const moodName = lower(context.mood || seed.mood || context.label);
  const moodText = songMood(song);
  if (!moodName || !moodText) return false;
  return moodText.includes(moodName) || moodName.includes(moodText);
}

function searchMatches(
  song: QueueBuildSong,
  context: PlaybackQueueContext,
  seed: QueueBuildSong
) {
  const query = lower(context.searchQuery || context.label?.replace(/^search:\s*/i, ""));
  if (!query) {
    return artistMatches(song, context, seed) || genreMatches(song, context, seed);
  }
  const haystack = [
    song.title,
    song.artist,
    song.album,
    song.genre,
    song.mood,
  ]
    .map(lower)
    .join(" ");
  return haystack.includes(query) || artistMatches(song, context, seed) || genreMatches(song, context, seed);
}

function resolverTypeForContext(source: PlaybackQueueContext["source"]): CatalogResolverType | null {
  if (source === "genre") return "genre";
  if (source === "mood" || source === "home_rail") return "mood";
  if (source === "radio" || source === "playlist") return "category";
  return null;
}

function matchWithCatalogResolver(
  catalog: QueueBuildSong[],
  context: PlaybackQueueContext
) {
  const resolverType = resolverTypeForContext(context.source);
  if (!resolverType) return [];

  const label =
    context.label ||
    context.mood ||
    context.genre ||
    context.albumTitle ||
    context.artistName ||
    "";

  if (!text(label)) return [];

  const target = buildCatalogTarget({
    type: resolverType,
    title: label,
    query: label,
    id: context.albumId || context.artistName || label,
  });

  return dedupeSongs(
    matchSongsForCatalogTarget(catalog, target).filter(isPlayableSong)
  );
}

function filterByContext(
  catalog: QueueBuildSong[],
  context: PlaybackQueueContext,
  seed: QueueBuildSong
) {
  const resolverMatches = matchWithCatalogResolver(catalog, context);
  if (resolverMatches.length) return resolverMatches;

  const source = context.source;

  if (source === "full_catalog") {
    return catalog;
  }
  if (source === "album") {
    return catalog.filter((song) => albumMatches(song, context, seed));
  }
  if (source === "artist") {
    return catalog.filter((song) => artistMatches(song, context, seed));
  }
  if (source === "genre") {
    return catalog.filter((song) => genreMatches(song, context, seed));
  }
  if (source === "mood" || source === "home_rail") {
    return catalog.filter(
      (song) => moodMatches(song, context, seed) || genreMatches(song, context, seed)
    );
  }
  if (source === "radio" || source === "playlist") {
    return catalog.filter(
      (song) =>
        moodMatches(song, context, seed) ||
        genreMatches(song, context, seed) ||
        artistMatches(song, context, seed)
    );
  }
  if (source === "search") {
    return catalog.filter((song) => searchMatches(song, context, seed));
  }
  if (source === "recently_added" || source === "because_you_listened") {
    return catalog;
  }
  return catalog;
}

function expandSparseContextualQueue(
  candidates: QueueBuildSong[],
  catalog: QueueBuildSong[],
  context: PlaybackQueueContext,
  seed: QueueBuildSong,
  preferredGenres: string[]
) {
  if (candidates.length > 1 || catalog.length <= 1) {
    return { queue: candidates, builtFromSuffix: "" };
  }

  const layers: QueueBuildSong[][] = [candidates];
  const artistMatchesList = catalog.filter((song) => artistMatches(song, context, seed));
  if (artistMatchesList.length) layers.push(artistMatchesList);

  const seedGenre = text(seed.genre);
  if (seedGenre) {
    layers.push(
      matchWithCatalogResolver(catalog, {
        ...context,
        source: "genre",
        genre: seedGenre,
        label: seedGenre,
      })
    );
  }

  for (const genre of preferredGenres) {
    layers.push(
      matchWithCatalogResolver(catalog, {
        ...context,
        source: "genre",
        genre,
        label: genre,
      })
    );
  }

  layers.push(catalog);

  const expanded = dedupeSongs(layers.flat()).filter(isPlayableSong);
  return {
    queue: expanded.length ? expanded : candidates,
    builtFromSuffix: "_expanded",
  };
}

function buildSearchQueue(
  provided: QueueBuildSong[],
  catalog: QueueBuildSong[],
  context: PlaybackQueueContext,
  seed: QueueBuildSong
) {
  const visible = dedupeSongs(provided.filter(isPlayableSong));
  const sameArtist = catalog.filter((song) => artistMatches(song, context, seed));
  const sameAlbum = catalog.filter((song) => albumMatches(song, context, seed));
  const sameGenre = catalog.filter((song) => genreMatches(song, context, seed));
  const sameMood = catalog.filter((song) => moodMatches(song, context, seed));
  return dedupeSongs([...visible, ...sameArtist, ...sameAlbum, ...sameGenre, ...sameMood, ...catalog]);
}

function buildDiscoveryDiagnostics(input: {
  catalog: QueueBuildSong[];
  playableCatalog: QueueBuildSong[];
  preferredGenres: string[];
  candidates: QueueBuildSong[];
  finalQueue: QueueBuildSong[];
  context: PlaybackQueueContext;
}) {
  const diagnostics: Record<string, unknown> = {
    discovery_catalog_size: input.catalog.length,
    discovery_playable_catalog_size: input.playableCatalog.length,
    discovery_preferred_genres: input.preferredGenres,
    room_queue_candidates: input.candidates.length,
    room_queue_final_length:
      input.context.source === "mood" || input.context.source === "home_rail"
        ? input.finalQueue.length
        : undefined,
    genre_queue_final_length:
      input.context.source === "genre" ? input.finalQueue.length : undefined,
    album_tracks_found:
      input.context.source === "album" ? input.finalQueue.length : undefined,
  };

  return Object.fromEntries(
    Object.entries(diagnostics).filter(([, value]) => value !== undefined)
  );
}

export function buildContextualPlaybackQueue(options: {
  song: QueueBuildSong;
  context: PlaybackQueueContext;
  providedQueue?: QueueBuildSong[];
  requestedIndex?: number;
}): QueueBuildResult {
  const { song, context, providedQueue, requestedIndex } = options;
  const seed = song;
  const catalog = getCatalogPlayable();
  const preferredGenres = getDiscoveryPreferredGenres();

  // Motivationals sessions must never expand into the Music discovery catalog.
  // Metadata-only up-next rows are valid and must be preserved for resolve-on-demand.
  if (
    isMotivationQueueContext(context) ||
    isMotivationDomainSong(seed) ||
    (providedQueue || []).some(isMotivationDomainSong)
  ) {
    return preserveStrictDomainQueue({
      seed,
      providedQueue,
      requestedIndex,
      isDomainSong: isMotivationDomainSong,
      builtFrom: "motivation_domain_preserved",
      diagnostics: {
        motivation_domain_guard: true,
        discovery_catalog_size: catalog.length,
      },
    });
  }

  // Lectures must never expand into Music discovery. Keep the supplied course queue.
  if (
    isEducationalQueueContext(context) ||
    isEducationalDomainSong(seed) ||
    (providedQueue || []).some(isEducationalDomainSong)
  ) {
    const result = preserveStrictDomainQueue({
      seed,
      providedQueue,
      requestedIndex,
      isDomainSong: isEducationalDomainSong,
      builtFrom: "educational_domain_preserved",
      diagnostics: {
        educational_domain_guard: true,
        discovery_catalog_size: catalog.length,
        program_id: text(
          (context as PlaybackQueueContext & { contextId?: string; albumId?: string })
            .contextId || context.albumId
        ),
      },
    });

    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[LECTURE_QUEUE] accepted", {
        providedLength: (providedQueue || []).length,
        finalLength: result.queue.length,
        activeIndex: result.activeIndex,
        programId: result.diagnostics.program_id || null,
        expanded: false,
        foreignItemCount: 0,
      });
    }

    const active = result.queue[result.activeIndex];
    const invalid =
      result.queue.length === 0 ||
      result.activeIndex < 0 ||
      result.activeIndex >= result.queue.length ||
      !active ||
      text(active.id) !== text(seed.id) ||
      result.queue.some((item) => !isEducationalDomainSong(item));

    if (invalid) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[LECTURE_QUEUE] validation_failed_fallback_to_provided", {
          seedId: seed.id,
          providedLength: (providedQueue || []).length,
          finalLength: result.queue.length,
          activeIndex: result.activeIndex,
        });
      }
      const fallback = dedupeSongs(
        (providedQueue || []).filter((entry) => !isYouTubeSong(entry))
      );
      const placed = ensureSongInQueue(
        fallback.length ? fallback : isEducationalDomainSong(seed) ? [seed] : [],
        seed
      );
      return {
        queue: placed.queue,
        activeIndex:
          requestedIndex === undefined
            ? placed.activeIndex
            : Math.max(0, Math.min(requestedIndex, placed.queue.length - 1)),
        builtFrom: "educational_domain_fallback_provided",
        expanded: false,
        diagnostics: {
          educational_domain_guard: true,
          educational_validation_failed: true,
          discovery_catalog_size: catalog.length,
        },
      };
    }

    return result;
  }

  const provided = dedupeSongs((providedQueue || []).filter(isPlayableSong));

  if (context.source === "queue" && provided.length > 0) {
    const placed = ensureSongInQueue(provided, seed);
    const activeIndex =
      requestedIndex === undefined
        ? placed.activeIndex
        : Math.max(0, Math.min(requestedIndex, placed.queue.length - 1));
    return {
      queue: placed.queue,
      activeIndex,
      builtFrom: "queue_preserved",
      expanded: false,
      diagnostics: buildDiscoveryDiagnostics({
        catalog,
        playableCatalog: catalog,
        preferredGenres,
        candidates: provided,
        finalQueue: placed.queue,
        context,
      }),
    };
  }

  let builtFrom: string = context.source;
  let queue: QueueBuildSong[] = [];
  let expanded = provided.length <= 1;
  let candidates: QueueBuildSong[] = [];

  if (provided.length > 1) {
    queue = provided;
    builtFrom = `${context.source}_provided`;
    candidates = provided;
  } else if (context.source === "search") {
    if (provided.length >= 1) {
      queue = provided;
      builtFrom = "search_provided";
      expanded = false;
      candidates = provided;
    } else {
      candidates = filterByContext(catalog, context, seed);
      queue = candidates.length
        ? candidates
        : isPlayableSong(seed)
          ? [seed]
          : [];
      builtFrom = candidates.length ? "search_matched" : "search_seed";
      expanded = false;
    }
  } else {
    candidates = filterByContext(catalog, context, seed);
    const expandedResult = expanded
      ? expandSparseContextualQueue(candidates, catalog, context, seed, preferredGenres)
      : { queue: candidates, builtFromSuffix: "" };
    queue = dedupeSongs([...provided, ...expandedResult.queue]);
    builtFrom = `${context.source}_catalog${expandedResult.builtFromSuffix}`;
    if (!candidates.length && catalog.length) {
      builtFrom = `${context.source}_catalog_fallback`;
    }
  }

  if (!queue.length) {
    if (context.source === "search") {
      queue = isPlayableSong(seed) ? [seed] : [];
      builtFrom = "search_seed_fallback";
    } else {
      queue = catalog.length ? catalog : [seed];
      builtFrom = "catalog_fallback";
    }
  }

  const placed = ensureSongInQueue(queue, seed);
  const activeIndex =
    requestedIndex === undefined
      ? placed.activeIndex
      : Math.max(0, Math.min(requestedIndex, placed.queue.length - 1));

  const diagnostics = buildDiscoveryDiagnostics({
    catalog,
    playableCatalog: catalog,
    preferredGenres,
    candidates,
    finalQueue: placed.queue,
    context,
  });

  return {
    queue: placed.queue,
    activeIndex,
    builtFrom,
    expanded,
    diagnostics,
  };
}

export function logContextualQueueBuilt(
  log: (event: string, details: Record<string, unknown>) => void,
  context: PlaybackQueueContext,
  result: QueueBuildResult,
  songId: string
) {
  const base = {
    queue_context_source: context.source,
    queue_length: result.queue.length,
    queue_active_index: result.activeIndex,
    song_id: songId,
    built_from: result.builtFrom,
    expanded: result.expanded,
    ...result.diagnostics,
  };

  log("queue_build_complete", base);
  log("queue_context_source", { source: context.source });
  log("queue_length", { queue_length: result.queue.length });
  log("queue_active_index", { queue_active_index: result.activeIndex });

  switch (context.source) {
    case "full_catalog":
      log("full_catalog_queue_built", base);
      break;
    case "album":
      log("album_queue_built", {
        ...base,
        album_id: context.albumId || null,
        album_title: context.albumTitle || null,
      });
      break;
    case "artist":
      log("artist_queue_built", { ...base, artist_name: context.artistName || null });
      break;
    case "genre":
      log("genre_queue_built", { ...base, genre_name: context.genre || null });
      break;
    case "mood":
    case "home_rail":
      log("room_queue_built", { ...base, room_name: context.label || context.mood || null });
      break;
    case "radio":
    case "playlist":
      log("radio_queue_built", {
        ...base,
        station_name: context.label || context.genre || context.mood || null,
      });
      break;
    case "search":
      log("search_queue_built", {
        ...base,
        query: context.searchQuery || context.label || null,
        result_count: result.queue.length,
      });
      break;
    case "queue":
      log("queue_row_selected", base);
      break;
    default:
      break;
  }
}
