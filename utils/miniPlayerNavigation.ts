import type { AppSong, PlaybackQueueContext } from "../context/PlayerContext";
import { isArtistUuid } from "./artistIdentity";

export type MiniPlayerDestination =
  | { pathname: "/artist/[id]"; params: { id: string } }
  | { pathname: "/album/[id]"; params: { id: string } }
  | { pathname: "/podcasts/show/[id]"; params: { id: string } }
  | { pathname: "/audiobooks/[id]"; params: { id: string } }
  | { pathname: "/motivation/program/[id]"; params: { id: string } }
  | { pathname: "/lectures/[id]"; params: { id: string } }
  | { pathname: "/genre"; params: { id: string; title: string; query: string; type: "genre" } }
  | { pathname: "/stations" | "/youtube-feed" | "/music-feed" };

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stableId(...values: unknown[]): string {
  return values.map(clean).find(Boolean) || "";
}

export function resolveMiniPlayerDestination(
  song: AppSong | null | undefined,
  context: PlaybackQueueContext,
  flags: { isYoutubeMode: boolean; isLiveRadioMode: boolean },
): MiniPlayerDestination {
  if (flags.isYoutubeMode) return { pathname: "/youtube-feed" };
  if (flags.isLiveRadioMode || context.source === "radio") return { pathname: "/stations" };

  const artistId = stableId(song?.artistId, context.artistId);
  if (isArtistUuid(artistId)) {
    return { pathname: "/artist/[id]", params: { id: artistId } };
  }

  const albumId = stableId(song?.albumId, context.albumId);
  if (isArtistUuid(albumId)) {
    return { pathname: "/album/[id]", params: { id: albumId } };
  }

  const contentType = clean(song?.contentType).toLowerCase();
  const sourceName = clean(song?.sourceName).toLowerCase();
  const queueType = clean(context.queueType).toLowerCase();
  const contextType = clean(context.contextType).toLowerCase();
  const contextId = stableId(context.contextId, albumId);

  if (contentType === "podcast" || queueType === "podcast" || contextType === "podcast-show") {
    const showId = stableId(song?.showId, song?.podcastId, contextId);
    if (showId) return { pathname: "/podcasts/show/[id]", params: { id: showId } };
  }
  if (contentType === "audiobook" || queueType === "audiobook" || sourceName === "audiobook") {
    if (contextId) return { pathname: "/audiobooks/[id]", params: { id: contextId } };
  }
  if (context.source === "motivation" || queueType === "motivation" || contextType === "motivation-program") {
    if (contextId) return { pathname: "/motivation/program/[id]", params: { id: contextId } };
  }
  if (contentType === "lecture" || queueType === "lecture" || sourceName === "lectures") {
    if (contextId) return { pathname: "/lectures/[id]", params: { id: contextId } };
  }

  const genre = clean(context.genre || song?.genre);
  if (genre) {
    return {
      pathname: "/genre",
      params: { id: genre, title: genre, query: `${genre} music`, type: "genre" },
    };
  }
  return { pathname: "/music-feed" };
}
