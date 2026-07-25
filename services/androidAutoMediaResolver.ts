/**
 * Canonical Android Auto media-id resolver.
 * Routes car selections into the same playback owners used on the phone.
 * Does not create a second player, queue, or radio path.
 */
import { getCachedHiddenTunesCatalog } from "./hiddenTunes";
import {
  getAndroidAutoPlayableTrack,
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

export type AndroidAutoResolveDeps = PlaybackRouterDeps & {
  correlationId?: string;
  transactionId?: number;
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
    return {
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
    return songFavoriteToAppSong(favorite) as AppSong;
  } catch {
    return null;
  }
}

function songFromAndroidAutoTrack(mediaId: string): AppSong | null {
  const track = getAndroidAutoPlayableTrack(mediaId);
  if (!track?.url) return null;
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
  } as AppSong;
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
    const catalog = getCachedHiddenTunesCatalog();
    const resolved = catalog
      ? resolveAndroidAutoMediaId(catalog, mediaId)
      : null;
    if (resolved) {
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
    const station = radioStationFromFavoriteOrCatalog(parsed.id);
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
      if (episode) {
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

  if (
    parsed.kind === "audiobook" ||
    parsed.kind === "motivation" ||
    parsed.kind === "lecture"
  ) {
    // Roots hidden until a reliable resolver exists.
    return { ok: false, reason: `${parsed.kind}_root_hidden` };
  }

  return { ok: false, reason: "unsupported_media_id" };
}
