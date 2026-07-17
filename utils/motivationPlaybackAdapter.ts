import type { AppSong } from "@/context/PlayerContext";
import type { PlaybackQueueContext } from "@/context/PlayerContext";
import type { MotivationItem, MotivationProgram } from "@/types/motivation";
import { orderMotivationEpisodes } from "@/utils/motivationGrouping";
import { formatMotivationEpisodeTitle } from "@/utils/motivationPresentation";

export const MOTIVATION_ITEM_SONG_PREFIX = "motivation-item-";
export const MOTIVATION_QUEUE_TYPE = "motivation";
export const MOTIVATION_MAX_AUTO_NEXT_FAILURES = 3;

export function motivationItemSongId(itemId: string) {
  return `${MOTIVATION_ITEM_SONG_PREFIX}${itemId}`;
}

export function parseMotivationItemSongId(songId?: string | null) {
  const clean = String(songId || "");
  if (!clean.startsWith(MOTIVATION_ITEM_SONG_PREFIX)) return null;
  return clean.slice(MOTIVATION_ITEM_SONG_PREFIX.length) || null;
}

export function isMotivationItemAppSong(song?: AppSong | null) {
  return Boolean(parseMotivationItemSongId(song?.id));
}

export function isMotivationAudioPlayback(mediaType: string, playableUrl: string) {
  const type = String(mediaType || "").toLowerCase();
  const url = String(playableUrl || "");
  if (!url.startsWith("http")) return false;
  // Shared HiddenAudio path can play progressive audio and progressive mp4 audio tracks.
  if (type === "audio") return true;
  if (/\.(mp3|m4a|aac|wav|ogg|flac)(?:\?|$)/i.test(url)) return true;
  if (/\.(mp4|m4v)(?:\?|$)/i.test(url)) return true;
  if (type === "video" && /archive\.org\/download\//i.test(url)) return true;
  return false;
}

export function motivationItemToAppSong(
  program: Pick<MotivationProgram, "title" | "artwork_url" | "category_slug">,
  item: MotivationItem,
  playableUrl: string
): AppSong {
  const artist = item.speaker_name || item.channel_name || "Hidden Tunes Motivation";
  const artwork = item.artwork || program.artwork_url || "";

  const title = formatMotivationEpisodeTitle(item.title);
  return {
    id: motivationItemSongId(item.id),
    title,
    artist,
    album: program.title,
    user: { name: artist },
    channelTitle: program.title,
    artworkUrl: artwork,
    coverUrl: artwork,
    thumbnail: artwork,
    artwork,
    streamUrl: playableUrl,
    url: playableUrl,
    audioUrl: playableUrl,
    duration: item.duration_seconds || undefined,
    genre: item.category_slug || program.category_slug || "Motivation",
    source: "hidden-tunes",
    sourceName: "Motivationals",
    type: "r2",
    isOnline: true,
  };
}

export function motivationItemToMetadataAppSong(
  program: Pick<MotivationProgram, "title" | "artwork_url" | "category_slug">,
  item: MotivationItem
): AppSong {
  const artist = item.speaker_name || item.channel_name || "Hidden Tunes Motivation";
  const artwork = item.artwork || program.artwork_url || "";
  const title = formatMotivationEpisodeTitle(item.title);
  return {
    id: motivationItemSongId(item.id),
    title,
    artist,
    album: program.title,
    user: { name: artist },
    channelTitle: program.title,
    artworkUrl: artwork,
    coverUrl: artwork,
    thumbnail: artwork,
    artwork,
    streamUrl: "",
    url: "",
    audioUrl: "",
    duration: item.duration_seconds || undefined,
    genre: item.category_slug || program.category_slug || "Motivation",
    source: "hidden-tunes",
    sourceName: "Motivationals",
    type: "r2",
    isOnline: true,
  };
}

export type MotivationQueueContext = PlaybackQueueContext & {
  queueType?: typeof MOTIVATION_QUEUE_TYPE;
  contextType?: string;
  contextId?: string;
  contextTitle?: string;
};

export function buildMotivationQueueContext(input: {
  contextType: string;
  contextId?: string;
  contextTitle?: string;
  label?: string;
}): MotivationQueueContext {
  return {
    source: "unknown",
    label: input.label || "Motivationals",
    queueType: MOTIVATION_QUEUE_TYPE,
    contextType: input.contextType,
    contextId: input.contextId,
    contextTitle: input.contextTitle,
  };
}

export function isMotivationQueueContext(
  context?: PlaybackQueueContext | null
): context is MotivationQueueContext {
  return Boolean(context && (context as MotivationQueueContext).queueType === MOTIVATION_QUEUE_TYPE);
}

export function orderMotivationItems(items: MotivationItem[]) {
  return orderMotivationEpisodes(items);
}
