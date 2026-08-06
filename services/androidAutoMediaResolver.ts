/**
 * Canonical Android Auto media-id resolver.
 * Routes car selections into the same playback owners used on the phone.
 * Does not create a second player, queue, or radio path.
 */
import { getCachedHiddenTunesCatalog } from "./hiddenTunes";
import {
  getAndroidAutoPlayableTrack,
  getCurrentAndroidAutoCatalogSnapshot,
  parseAndroidAutoMediaId,
  resolveAndroidAutoMediaId,
} from "./androidAutoCatalogSync";
import {
  acceptAndroidAutoTransaction,
  isAndroidAutoTransactionCurrent,
} from "./androidAutoTapAuthority";
import { getFavorites, songFavoriteToAppSong } from "./favorites/unifiedFavorites";
import { normalizeRadioFavoriteStationId } from "./favorites/libraryFavoriteIdentity";
import {
  routeRadioPlayback,
  type PlaybackRouterDeps,
} from "./playback/playbackRouter";
import { loadPodcastRecentlyPlayed } from "./podcastRecentlyPlayed";
import {
  podcastEpisodeToAppSong,
  buildPodcastQueueContext,
} from "../utils/podcastPlaybackAdapter";
import type { RadioStation } from "../types/radio";
import type { AppSong } from "../context/PlayerContext";
import { isAndroidAutoContentVisible } from "./androidAutoVisibility";

export type AndroidAutoResolveDeps = PlaybackRouterDeps & {
  correlationId?: string;
  transactionId?: number;
  seekTo?: (positionMillis: number) => Promise<void>;
};

function logAndroidAutoPlayback(
  event: string,
  payload: Record<string, unknown> = {}
) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log("[AndroidAutoPlayback]", event, payload);
}

function assertTapCurrent(
  transactionId: number | undefined,
  phase: string
): boolean {
  const tx = Number(transactionId) || 0;
  if (tx > 0) acceptAndroidAutoTransaction(tx);
  if (isAndroidAutoTransactionCurrent(tx)) return true;
  logAndroidAutoPlayback("stale_transaction_ignored", {
    phase,
    transactionId: tx || null,
  });
  return false;
}

function radioStationFromFavoriteOrCatalog(id: string): RadioStation | null {
  const clean = normalizeRadioFavoriteStationId(id);
  if (!clean) return null;

  const favorite = getFavorites().find(
    (item) =>
      item.type === "radio_station" &&
      normalizeRadioFavoriteStationId(item.id) === clean
  );
  if (favorite) {
    const station: RadioStation = {
      id: clean,
      title: favorite.title,
      streamUrl: String(favorite.metadata?.streamUrl || ""),
      artworkUrl: favorite.artwork,
      country: favorite.metadata?.stationCountry
        ? String(favorite.metadata.stationCountry)
        : undefined,
      genre: favorite.metadata?.stationGenre
        ? String(favorite.metadata.stationGenre)
        : undefined,
      tags: favorite.metadata?.stationGenre
        ? [String(favorite.metadata.stationGenre)]
        : [],
      source: "radio",
    };
    return isAndroidAutoContentVisible(station, "radio") ? station : null;
  }

  return {
    id: clean,
    title: "Radio",
    streamUrl: "",
    tags: [],
    source: "radio",
  };
}

function songFromFavorite(id: string): AppSong | null {
  const favorite = getFavorites().find(
    (item) => item.type === "song" && String(item.id) === String(id)
  );
  if (!favorite) return null;
  try {
    const song = songFavoriteToAppSong(favorite) as AppSong;
    return isAndroidAutoContentVisible(song, "music") ? song : null;
  } catch {
    return null;
  }
}

function songFromAndroidAutoTrack(mediaId: string): AppSong | null {
  const track = getAndroidAutoPlayableTrack(mediaId);
  if (!track?.url) return null;
  const raw = track as typeof track & Record<string, unknown>;
  return {
    id: track.id || mediaId,
    title: track.title || "Untitled",
    artist: track.artist || "Hidden Tunes",
    album: track.album || "",
    artwork: track.artworkUrl || "",
    cover: track.artworkUrl || "",
    thumbnail: track.artworkUrl || "",
    streamUrl: track.url,
    url: track.url,
    duration: track.durationSeconds || 0,
    contentType: track.contentType,
    type: track.contentType === "podcast" ? "podcast"
      : track.contentType === "radio" ? "live_stream" : undefined,
    episodeId: String(raw.episodeId || "") || undefined,
    showId: String(raw.showId || "") || undefined,
    showTitle: track.contentType === "podcast" ? track.artist : undefined,
    albumId: String(raw.bookId || "") || undefined,
  } as AppSong;
}

function radioStationFromSnapshot(mediaId: string): RadioStation | null {
  const track = getAndroidAutoPlayableTrack(mediaId);
  if (!track || track.contentType !== "radio" || !track.url) return null;
  return {
    id: String(track.canonicalId || track.id),
    title: track.title || "Radio",
    streamUrl: track.url,
    artworkUrl: track.artworkUrl || undefined,
    tags: [],
    source: "radio",
  };
}

function resolveSnapshotMusicQueue(mediaId: string) {
  const snapshot = getCurrentAndroidAutoCatalogSnapshot();
  const selectedTrack = getAndroidAutoPlayableTrack(mediaId);
  if (!snapshot || !selectedTrack) return null;
  const parentId = String(selectedTrack.parentId || "recently_added");
  const section = snapshot.sections.find((entry) => entry.parentId === parentId);
  const queue = (section?.items || [])
    .filter((item) => item.playable)
    .map((item) => songFromAndroidAutoTrack(item.mediaId))
    .filter((song): song is AppSong => Boolean(song));
  const song = songFromAndroidAutoTrack(mediaId);
  if (!song) return null;
  const selectedCanonicalId = String(selectedTrack.canonicalId || selectedTrack.id);
  const index = queue.findIndex((entry) => String(entry.id) === selectedCanonicalId);
  return {
    song,
    queue: index >= 0 ? queue : [song],
    index: index >= 0 ? index : 0,
    parentId,
  };
}

function resolveSnapshotDomainQueue(mediaId: string, expectedDomain: "podcast" | "audiobook") {
  const snapshot = getCurrentAndroidAutoCatalogSnapshot();
  const selectedTrack = getAndroidAutoPlayableTrack(mediaId);
  if (!snapshot || !selectedTrack || selectedTrack.contentType !== expectedDomain) return null;
  const parentId = String(selectedTrack.parentId || "");
  const section = snapshot.sections.find((entry) => entry.parentId === parentId);
  const queue = (section?.items || []).filter((item) => item.playable)
    .map((item) => songFromAndroidAutoTrack(item.mediaId))
    .filter((song): song is AppSong => Boolean(song));
  const song = songFromAndroidAutoTrack(mediaId);
  if (!song) return null;
  const index = queue.findIndex((item) => item.id === song.id);
  return { song, queue: index >= 0 ? queue : [song], index: index >= 0 ? index : 0,
    parentId, track: selectedTrack };
}

/** Resolve the canonical JS queue for native cold-start reconciliation.
 * This function never starts, seeks, pauses, or reloads playback. */
export function resolveAndroidAutoQueueContext(mediaId: string) {
  const parsed = parseAndroidAutoMediaId(mediaId);
  if (parsed.kind === "song") {
    const resolved = resolveSnapshotMusicQueue(mediaId);
    if (!resolved) return null;
    return { queue: resolved.queue, index: resolved.index, mode: "standard" as const,
      context: { source: "android_auto", label: "Android Auto",
        contextType: "android-auto-section", contextId: resolved.parentId } };
  }
  if (parsed.kind === "podcast" || parsed.kind === "audiobook") {
    const resolved = resolveSnapshotDomainQueue(mediaId, parsed.kind);
    if (!resolved) return null;
    return { queue: resolved.queue, index: resolved.index, mode: "standard" as const,
      context: parsed.kind === "podcast"
        ? buildPodcastQueueContext({ showId: resolved.track.showId, showTitle: resolved.track.artist })
        : { source: "playlist", label: resolved.track.album || "Audiobook",
          queueType: "audiobook", contextType: "audiobook",
          contextId: resolved.track.bookId || "", albumId: resolved.track.bookId || "" } };
  }
  return null;
}

/**
 * Resolve and play a media ID selected from Android Auto.
 * Latest-wins radio switch is owned by routeRadioPlayback.
 * Music/podcast honor Android Auto transaction IDs across async gaps.
 */
export async function playAndroidAutoMediaId(
  mediaId: string,
  deps: AndroidAutoResolveDeps
): Promise<{ ok: boolean; reason?: string }> {
  const parsed = parseAndroidAutoMediaId(mediaId);
  const transactionId = Number(deps.transactionId) || 0;
  acceptAndroidAutoTransaction(transactionId);

  logAndroidAutoPlayback("android_auto_media_selected", {
    mediaId,
    kind: parsed.kind,
    correlationId: deps.correlationId || null,
    transactionId: transactionId || null,
  });

  if (!assertTapCurrent(transactionId, "resolve_start")) {
    return { ok: false, reason: "stale_transaction" };
  }

  if (parsed.kind === "song") {
    const snapshotResolved = resolveSnapshotMusicQueue(mediaId);
    if (snapshotResolved) {
      if (!assertTapCurrent(transactionId, "before_music_snapshot_play")) {
        return { ok: false, reason: "stale_transaction" };
      }
      await deps.playSong(
        snapshotResolved.song,
        snapshotResolved.queue,
        snapshotResolved.index,
        {
          source: snapshotResolved.parentId.startsWith("album:") ? "album"
            : snapshotResolved.parentId.startsWith("artist:") ? "artist"
              : snapshotResolved.parentId.startsWith("genre:") ? "genre"
                : snapshotResolved.parentId.startsWith("playlist:") ? "playlist"
                  : snapshotResolved.parentId === "recently_added" ? "recently_added"
                    : "android_auto",
          label: `Android Auto · ${snapshotResolved.parentId.replace(/[:_-]+/g, " ")}`,
          contextType: "android-auto-section",
          contextId: snapshotResolved.parentId,
        } as any
      );
      return { ok: true };
    }
    const catalog = getCachedHiddenTunesCatalog();
    const resolved = catalog
      ? resolveAndroidAutoMediaId(catalog, mediaId)
      : null;
    if (resolved && isAndroidAutoContentVisible(resolved.song, "music")) {
      if (!assertTapCurrent(transactionId, "before_music_catalog_play")) {
        return { ok: false, reason: "stale_transaction" };
      }
      logAndroidAutoPlayback("canonical_player_invoked", {
        path: "music_catalog",
        mediaId,
      });
      await deps.playSong(resolved.song as AppSong, resolved.queue as AppSong[], 0, {
        source: "android_auto",
        label: "Android Auto",
      } as any);
      return { ok: true };
    }
    const favoriteSong = songFromFavorite(parsed.id);
    if (favoriteSong) {
      if (!assertTapCurrent(transactionId, "before_music_favorite_play")) {
        return { ok: false, reason: "stale_transaction" };
      }
      logAndroidAutoPlayback("canonical_player_invoked", {
        path: "music_favorite",
        mediaId,
      });
      await deps.playSong(favoriteSong, [favoriteSong], 0, {
        source: "android_auto",
        label: "Android Auto",
      } as any);
      return { ok: true };
    }
    const registrySong = songFromAndroidAutoTrack(mediaId);
    if (registrySong) {
      if (!assertTapCurrent(transactionId, "before_music_registry_play")) {
        return { ok: false, reason: "stale_transaction" };
      }
      logAndroidAutoPlayback("canonical_player_invoked", {
        path: "music_registry",
        mediaId,
      });
      await deps.playSong(registrySong, [registrySong], 0, {
        source: "android_auto",
        label: "Android Auto",
      } as any);
      return { ok: true };
    }
    return { ok: false, reason: "song_not_found" };
  }

  if (parsed.kind === "radio") {
    if (!assertTapCurrent(transactionId, "before_radio_route")) {
      return { ok: false, reason: "stale_transaction" };
    }
    const station = radioStationFromSnapshot(mediaId) || radioStationFromFavoriteOrCatalog(parsed.id);
    if (!station) return { ok: false, reason: "radio_not_found" };
    logAndroidAutoPlayback("canonical_player_invoked", {
      path: "radio_route",
      mediaId,
      stationId: station.id,
    });
    const result = await routeRadioPlayback(station, deps, {
      origin: "android_auto",
      label: "Android Auto Radio",
      cacheKey: "android_auto",
    });
    return result.ok ? { ok: true } : { ok: false, reason: "radio_route_failed" };
  }

  if (parsed.kind === "podcast") {
    const snapshotQueue = resolveSnapshotDomainQueue(mediaId, "podcast");
    if (snapshotQueue) {
      if (!assertTapCurrent(transactionId, "before_podcast_snapshot_play")) {
        return { ok: false, reason: "stale_transaction" };
      }
      await deps.playSong(snapshotQueue.song, snapshotQueue.queue, snapshotQueue.index,
        buildPodcastQueueContext({ showId: snapshotQueue.track.showId,
          showTitle: snapshotQueue.track.artist }) as any, "standard");
      if (snapshotQueue.track.resumePositionMillis && deps.seekTo) {
        await deps.seekTo(snapshotQueue.track.resumePositionMillis);
      }
      return { ok: true };
    }
    // Prefer canonical AA catalog registry (synced snapshot) — not recently-played-only.
    const registrySong = songFromAndroidAutoTrack(mediaId);
    if (registrySong) {
      if (!assertTapCurrent(transactionId, "before_podcast_registry_play")) {
        return { ok: false, reason: "stale_transaction" };
      }
      logAndroidAutoPlayback("canonical_player_invoked", {
        path: "podcast_registry",
        mediaId,
      });
      await deps.playSong(
        registrySong,
        [registrySong],
        0,
        buildPodcastQueueContext({
          showId: undefined,
          showTitle: registrySong.artist,
        }) as any,
        "standard"
      );
      return { ok: true };
    }

    try {
      const recent = await loadPodcastRecentlyPlayed();
      if (!assertTapCurrent(transactionId, "after_podcast_recent_load")) {
        return { ok: false, reason: "stale_transaction" };
      }
      const episode = (recent || []).find(
        (entry) => String(entry.id) === String(parsed.id)
      );
      if (episode && isAndroidAutoContentVisible(
        { ...episode, url: episode.audioUrl },
        "podcast"
      )) {
        const song = podcastEpisodeToAppSong(episode);
        const context = buildPodcastQueueContext({
          showId: episode.showId,
          showTitle: episode.showTitle,
          creatorId: episode.publisher,
          categoryId: episode.categories?.[0],
        });
        logAndroidAutoPlayback("canonical_player_invoked", {
          path: "podcast_recent",
          mediaId,
        });
        await deps.playSong(song, [song], 0, context as any, "standard");
        return { ok: true };
      }
    } catch {
      // fall through
    }
    return { ok: false, reason: "podcast_not_in_android_auto_catalog" };
  }

  if (parsed.kind === "audiobook") {
    const snapshotQueue = resolveSnapshotDomainQueue(mediaId, "audiobook");
    if (!snapshotQueue) return { ok: false, reason: "audiobook_not_in_android_auto_catalog" };
    if (!assertTapCurrent(transactionId, "before_audiobook_snapshot_play")) {
      return { ok: false, reason: "stale_transaction" };
    }
    await deps.playSong(snapshotQueue.song, snapshotQueue.queue, snapshotQueue.index, {
      source: "playlist", label: snapshotQueue.track.album || "Audiobook",
      queueType: "audiobook", contextType: "audiobook",
      contextId: snapshotQueue.track.bookId || "", albumId: snapshotQueue.track.bookId || "",
    } as any, "standard");
    if (snapshotQueue.track.resumePositionMillis && deps.seekTo) {
      await deps.seekTo(snapshotQueue.track.resumePositionMillis);
    }
    return { ok: true };
  }

  if (
    parsed.kind === "motivation" ||
    parsed.kind === "lecture"
  ) {
    // Roots hidden until a reliable resolver exists.
    return { ok: false, reason: `${parsed.kind}_root_hidden` };
  }

  return { ok: false, reason: "unsupported_media_id" };
}
