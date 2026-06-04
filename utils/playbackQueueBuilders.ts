import type { PlaybackQueueContext } from "../context/PlayerContext";
import { getCachedHiddenTunesCatalog } from "../services/hiddenTunes";

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
};

function text(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
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

function songArtist(song: QueueBuildSong) {
  return lower(song.artist || song.user?.name || song.channelTitle);
}

function songAlbum(song: QueueBuildSong) {
  return lower(song.album);
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
  const catalog = getCachedHiddenTunesCatalog()?.songs || [];
  return dedupeSongs(catalog.filter(isPlayableSong));
}

function albumMatches(song: QueueBuildSong, context: PlaybackQueueContext, seed: QueueBuildSong) {
  const albumId = lower(context.albumId || seed.albumId);
  const albumTitle = lower(context.albumTitle || seed.album);
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
  const moodName = lower(context.mood || seed.mood);
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

function filterByContext(
  catalog: QueueBuildSong[],
  context: PlaybackQueueContext,
  seed: QueueBuildSong
) {
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

export function buildContextualPlaybackQueue(options: {
  song: QueueBuildSong;
  context: PlaybackQueueContext;
  providedQueue?: QueueBuildSong[];
  requestedIndex?: number;
}): QueueBuildResult {
  const { song, context, providedQueue, requestedIndex } = options;
  const seed = song;
  const catalog = getCatalogPlayable();
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
    };
  }

  let builtFrom: string = context.source;
  let queue: QueueBuildSong[] = [];
  const expanded = provided.length <= 1;

  if (provided.length > 1) {
    queue = provided;
    builtFrom = `${context.source}_provided`;
  } else if (context.source === "search") {
    queue = buildSearchQueue(provided, catalog, context, seed);
    builtFrom = "search_contextual";
  } else {
    const contextual = filterByContext(catalog, context, seed);
    queue = dedupeSongs([...provided, ...contextual]);
    builtFrom = `${context.source}_catalog`;
  }

  if (!queue.length) {
    queue = catalog.length ? catalog : [seed];
    builtFrom = "catalog_fallback";
  }

  const placed = ensureSongInQueue(queue, seed);
  const activeIndex =
    requestedIndex === undefined
      ? placed.activeIndex
      : Math.max(0, Math.min(requestedIndex, placed.queue.length - 1));

  return {
    queue: placed.queue,
    activeIndex,
    builtFrom,
    expanded,
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
