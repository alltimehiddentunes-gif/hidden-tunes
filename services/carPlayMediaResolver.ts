import type { AppSong, PlaybackQueueContext } from "../context/PlayerContext";
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
};

let currentSnapshot: AndroidAutoCatalogSnapshot | null = null;

export function rememberCarPlayCatalogSnapshot(snapshot: AndroidAutoCatalogSnapshot) {
  currentSnapshot = snapshot;
}

function playableUri(track: AndroidAutoTrackPayload) {
  return String(track.url || "").trim();
}

function toAppSong(track: AndroidAutoTrackPayload): AppSong | null {
  const id = String(track.id || "").trim();
  const title = String(track.title || "").trim();
  const uri = playableUri(track);
  if (!id || !title || !uri) return null;
  const artwork = String(track.artworkUrl || "").trim();
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
    source: track.isLive || track.contentType === "radio" ? "radio" : "carplay",
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
  const parents = snapshot.sections
    .filter((entry) => entry.items.some((item) => item.playable && item.mediaId === mediaId))
    .map((entry) => entry.parentId);
  return parents.find((parent) => parent === "recently_added")
    || parents.find((parent) => parent === "made_for_you")
    || parents[0]
    || "music";
}

function queueContext(parentId: string): PlaybackQueueContext {
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
  if (!selectedTrack || !playableUri(selectedTrack)) return null;

  const parentId = preferredParentId(snapshot, cleanId, requestedParentId);
  const section = snapshot.sections.find((entry) => entry.parentId === parentId);
  const queueIds = (section?.items || [])
    .filter((item) => item.playable)
    .map((item) => item.mediaId);
  const queue = queueIds
    .map((id) => snapshot.tracks.find((track) => track.mediaId === id))
    .filter((track): track is AndroidAutoTrackPayload => Boolean(track && playableUri(track)))
    .map(toAppSong)
    .filter((song): song is AppSong => Boolean(song));
  const song = toAppSong(selectedTrack);
  if (!song) return null;

  const index = queue.findIndex((entry) => entry.id === song.id);
  const resolvedQueue = index >= 0 ? queue : [song];
  return {
    song,
    queue: resolvedQueue,
    index: index >= 0 ? index : 0,
    queueContext: queueContext(parentId),
    queueMode: selectedTrack.isLive || selectedTrack.contentType === "radio"
      ? "live_stream"
      : "standard",
  };
}

export function clearCarPlayCatalogSnapshotForTests() {
  currentSnapshot = null;
}
