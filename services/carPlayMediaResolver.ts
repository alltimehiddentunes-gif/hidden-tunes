import type { AppSong, PlaybackQueueContext } from "../context/PlayerContext";
import type { RadioStation } from "../types/radio";
import type {
  AndroidAutoCatalogSnapshot,
  AndroidAutoTrackPayload,
} from "./androidAutoCatalogSync";

export type ResolvedCarPlayMedia = {
  song: AppSong;
  queue: AppSong[];
  index: number;
  queueContext: PlaybackQueueContext;
  queueMode: "standard" | "live_stream";
  resumePositionMillis: number;
  radioStation?: RadioStation;
};

let currentSnapshot: AndroidAutoCatalogSnapshot | null = null;
let isTrackVisible = (_track: AndroidAutoTrackPayload) => true;

export function configureCarPlayMediaVisibility(
  visibility: (track: AndroidAutoTrackPayload) => boolean
) {
  isTrackVisible = visibility;
}

export function rememberCarPlayCatalogSnapshot(snapshot: AndroidAutoCatalogSnapshot) {
  currentSnapshot = snapshot;
}

function playableUri(track: AndroidAutoTrackPayload) {
  return String(track.url || "").trim();
}

function toAppSong(track: AndroidAutoTrackPayload): AppSong | null {
  const raw = track as AndroidAutoTrackPayload & Record<string, unknown>;
  const id = String(track.id || "").trim();
  const title = String(track.title || "").trim();
  const uri = playableUri(track);
  if (!id || !title || !uri) return null;
  const artwork = String(track.artworkUrl || "").trim();
  const contentType = String(track.contentType || "").toLowerCase();
  const source = contentType === "radio" || track.isLive ? "radio"
    : contentType === "podcast" ? "podcast"
      : contentType === "audiobook" ? "hidden-tunes" : "carplay";
  return {
    id,
    title,
    artist: String(track.artist || "Hidden Tunes").trim() || "Hidden Tunes",
    album: String(track.album || ""),
    artwork,
    cover: artwork,
    thumbnail: artwork,
    streamUrl: uri,
    url: uri,
    duration: Number(track.durationSeconds) > 0 ? Number(track.durationSeconds) : 0,
    source,
    sourceName: contentType === "podcast" ? "Podcast"
      : contentType === "audiobook" ? "Audiobook" : undefined,
    type: contentType === "podcast" ? "podcast"
      : contentType === "audiobook" ? "r2"
        : contentType === "radio" ? "live_stream" : undefined,
    contentType: contentType || undefined,
    episodeId: String(raw.episodeId || "").trim() || undefined,
    showId: String(raw.showId || "").trim() || undefined,
    showTitle: contentType === "podcast" ? track.artist : undefined,
    albumId: String(raw.bookId || "").trim() || undefined,
  } as AppSong;
}

function preferredParentId(
  snapshot: AndroidAutoCatalogSnapshot,
  mediaId: string,
  requestedParentId?: string
) {
  const requested = String(requestedParentId || "").trim();
  if (requested && requested !== "search_results") {
    const exactSection = snapshot.sections.find((entry) => entry.parentId === requested);
    if (exactSection?.items.some((item) => item.playable && item.mediaId === mediaId)) {
      return requested;
    }
  }
  if (mediaId.startsWith("recent:")) return "recently_played";
  if (mediaId.startsWith("fav:")) return "favorites";
  const track = snapshot.tracks.find((entry) => entry.mediaId === mediaId);
  if (track?.isLive || track?.contentType === "radio") return "radio";
  const raw = (track || {}) as AndroidAutoTrackPayload & Record<string, unknown>;
  if (track?.contentType === "podcast" && raw.showId) {
    const showParent = `podcast-show:${String(raw.showId)}`;
    if (snapshot.sections.some((entry) => entry.parentId === showParent)) return showParent;
  }
  if (track?.contentType === "audiobook" && raw.bookId) {
    const bookParent = `audiobook-book:${String(raw.bookId)}`;
    if (snapshot.sections.some((entry) => entry.parentId === bookParent)) return bookParent;
  }
  const parents = snapshot.sections
    .filter((entry) => entry.items.some((item) => item.playable && item.mediaId === mediaId))
    .map((entry) => entry.parentId);
  return parents.find((parent) => parent === "recently_added")
    || parents.find((parent) => parent === "made_for_you")
    || parents[0]
    || "music";
}

function queueContext(parentId: string, track?: AndroidAutoTrackPayload): PlaybackQueueContext {
  const raw = (track || {}) as AndroidAutoTrackPayload & Record<string, unknown>;
  const contentType = String(track?.contentType || "").toLowerCase();
  if (contentType === "radio") {
    return { source: "radio", label: "CarPlay · Radio", queueType: "live_radio",
      contextType: "live-radio-session", contextId: String(raw.stationId || track?.id || "") };
  }
  if (contentType === "podcast") {
    return { source: "playlist", label: track?.artist || "Podcasts", queueType: "podcast",
      contextType: "podcast-show", contextId: String(raw.showId || ""),
      contextTitle: track?.artist || undefined };
  }
  if (contentType === "audiobook") {
    return { source: "playlist", label: track?.album || "Audiobooks", queueType: "audiobook",
      contextType: "audiobook", contextId: String(raw.bookId || ""),
      contextTitle: track?.album || undefined, albumId: String(raw.bookId || "") };
  }
  const source: PlaybackQueueContext["source"] =
    parentId === "recently_added" ? "recently_added"
      : parentId.startsWith("artist:") ? "artist"
        : parentId.startsWith("album:") ? "album"
          : parentId.startsWith("genre:") ? "genre"
            : parentId.startsWith("playlist:") ? "playlist"
              : parentId === "radio" ? "radio"
                : "carplay";
  return {
    source,
    label: `CarPlay · ${parentId.replace(/[:_-]+/g, " ")}`,
    contextType: "carplay-section",
    contextId: parentId,
  };
}

/** Resolve only IDs present in the last snapshot actually handed to native CarPlay. */
export function resolveCarPlayMediaId(
  mediaId: string,
  requestedParentId?: string
): ResolvedCarPlayMedia | null {
  const snapshot = currentSnapshot;
  const cleanId = String(mediaId || "").trim();
  if (!snapshot || !cleanId) return null;

  const selectedTrack = snapshot.tracks.find((track) => track.mediaId === cleanId);
  if (!selectedTrack || !playableUri(selectedTrack) || !isTrackVisible(selectedTrack)) return null;

  const parentId = preferredParentId(snapshot, cleanId, requestedParentId);
  const section = snapshot.sections.find((entry) => entry.parentId === parentId);
  const queueIds = (section?.items || [])
    .filter((item) => item.playable)
    .map((item) => item.mediaId);
  const queue = queueIds
    .map((id) => snapshot.tracks.find((track) => track.mediaId === id))
    .filter((track): track is AndroidAutoTrackPayload => Boolean(
      track && playableUri(track) && isTrackVisible(track)
    ))
    .map(toAppSong)
    .filter((song): song is AppSong => Boolean(song));
  const song = toAppSong(selectedTrack);
  if (!song) return null;

  const isRadio = selectedTrack.isLive || selectedTrack.contentType === "radio";
  const domainQueue = isRadio ? [song] : queue;
  const domainIndex = isRadio ? 0 : domainQueue.findIndex((entry) => entry.id === song.id);

  const resolvedQueue = domainIndex >= 0 ? domainQueue : [song];
  const raw = selectedTrack as AndroidAutoTrackPayload & Record<string, unknown>;
  const stationId = String(raw.stationId || "").trim();
  return {
    song,
    queue: resolvedQueue,
    index: domainIndex >= 0 ? domainIndex : 0,
    queueContext: queueContext(parentId, selectedTrack),
    queueMode: isRadio
      ? "live_stream"
      : "standard",
    resumePositionMillis: Math.max(0, Number(raw.resumePositionMillis) || 0),
    radioStation: isRadio && stationId ? {
      id: stationId,
      title: selectedTrack.title,
      streamUrl: playableUri(selectedTrack),
      artworkUrl: String(selectedTrack.artworkUrl || "").trim() || undefined,
      country: String(raw.country || "").trim() || undefined,
      genre: String(raw.genre || "").trim() || undefined,
      source: "radio",
    } : undefined,
  };
}

export function clearCarPlayCatalogSnapshotForTests() {
  currentSnapshot = null;
}
