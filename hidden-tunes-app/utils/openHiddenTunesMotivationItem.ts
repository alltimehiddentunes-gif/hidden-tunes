import { router } from "expo-router";

import {
  fetchMotivationPlayback,
  type HiddenTunesMotivationItem,
} from "../services/motivationCatalogApi";

export type MotivationOpenResult = { ok: true } | { ok: false; error: string };

function isYoutubeSource(sourceType: string) {
  return String(sourceType || "").toLowerCase().startsWith("youtube");
}

function isHlsLikeSource(sourceType: string, streamUrl: string) {
  const normalized = String(sourceType || "").trim().toLowerCase();
  return (
    normalized === "hls_stream" ||
    normalized === "m3u_playlist" ||
    /\.m3u8(?:\?|$)/i.test(streamUrl)
  );
}

export async function openHiddenTunesMotivationItem(
  item: HiddenTunesMotivationItem
): Promise<MotivationOpenResult> {
  try {
    const playback = await fetchMotivationPlayback(item.id);

    if (isYoutubeSource(playback.source_type)) {
      router.push({
        pathname: "/youtube-player",
        params: {
          videoId: playback.source_id,
          title: item.title,
          artist: item.channel_name || "Hidden Tunes Motivation",
        },
      });
      return { ok: true };
    }

    if (isHlsLikeSource(playback.source_type, playback.stream_url)) {
      router.push({
        pathname: "/tv-player",
        params: {
          id: item.id,
          name: item.title,
          streamUrl: playback.stream_url,
          logoUrl: item.artwork || "",
          sourceLabel: item.channel_name || "Hidden Tunes Motivation",
        },
      });
      return { ok: true };
    }

    router.push({
      pathname: "/tv-player",
      params: {
        id: item.id,
        name: item.title,
        streamUrl: playback.stream_url,
        logoUrl: item.artwork || "",
        sourceLabel: item.channel_name || "Hidden Tunes Motivation",
        streamType: "mp4",
      },
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Motivation playback failed.",
    };
  }
}
