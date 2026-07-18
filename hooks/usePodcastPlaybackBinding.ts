import { useEffect, useRef } from "react";

import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
  type AppSong,
} from "@/context/PlayerContext";
import { fetchPodcastEpisodePlay } from "@/services/podcastCatalogApi";
import {
  bumpPodcastSkipFailure,
  canPodcastSkipInvalidNext,
  resetPodcastSkipFailures,
} from "@/utils/podcastPlayback";
import {
  isPodcastAppSong,
  isPodcastQueueContext,
  parsePodcastEpisodeSongId,
  podcastEpisodeToAppSong,
  podcastSongNeedsResolve,
  podcastTrace,
  buildPodcastQueueContext,
} from "@/utils/podcastPlaybackAdapter";
import type { PodcastEpisode } from "@/types/podcast";

/**
 * Resolve metadata-only Podcast queue rows on demand (backend catalog shows).
 * Mounted from app/podcasts/_layout.tsx — does not rewrite PlayerContext architecture.
 */
export function usePodcastPlaybackBinding() {
  const { playSong, nextSong } = usePlayerActions();
  const { currentSong } = usePlayerNowPlaying();
  const { activeQueueContext, activeQueue, activeQueueIndex } = usePlayerState();

  const resolvingRef = useRef<string | null>(null);
  const currentSongRef = useRef(currentSong);
  const activeQueueRef = useRef(activeQueue);
  const activeQueueIndexRef = useRef(activeQueueIndex);
  const activeQueueContextRef = useRef(activeQueueContext);

  currentSongRef.current = currentSong;
  activeQueueRef.current = activeQueue;
  activeQueueIndexRef.current = activeQueueIndex;
  activeQueueContextRef.current = activeQueueContext;

  useEffect(() => {
    if (!isPodcastAppSong(currentSong)) return;
    if (!isPodcastQueueContext(activeQueueContext) && !isPodcastAppSong(currentSong)) return;
    if (!podcastSongNeedsResolve(currentSong)) return;

    const songId = currentSong?.id || null;
    const episodeId = parsePodcastEpisodeSongId(songId);
    if (!songId || !episodeId || resolvingRef.current === songId) return;

    resolvingRef.current = songId;
    podcastTrace("NEXT_RESOLVE", {
      selectedEpisodeId: episodeId,
      showId: currentSong?.albumId || activeQueueContext?.albumId || null,
      activeIndex: activeQueueIndex,
      providedLength: activeQueue.length,
      reason: "resolve_on_demand",
    });

    void (async () => {
      try {
        const resolved = await fetchPodcastEpisodePlay(episodeId);
        if (!resolved.success || !resolved.play?.audioUrl) {
          if (!canPodcastSkipInvalidNext()) {
            podcastTrace("NEXT_RESOLVE", {
              selectedEpisodeId: episodeId,
              reason: "max_invalid_skips",
            });
            return;
          }
          bumpPodcastSkipFailure();
          await nextSong();
          return;
        }

        const play = resolved.play;
        const durationRaw = play.durationSeconds ?? currentSong?.duration;
        const durationSeconds =
          typeof durationRaw === "number" && Number.isFinite(durationRaw)
            ? durationRaw
            : undefined;
        const episode: PodcastEpisode = {
          id: play.id || episodeId,
          showId: play.showId || String(currentSong?.albumId || ""),
          showTitle: String(currentSong?.album || currentSong?.artist || "Podcast"),
          publisher: currentSong?.artist,
          title: play.title || currentSong?.title || "Episode",
          description: "",
          artworkUrl: String(currentSong?.artworkUrl || currentSong?.artwork || ""),
          audioUrl: play.audioUrl,
          durationSeconds,
          publishedAt: play.publishedAt,
          language: "unknown",
          categories: currentSong?.genre ? [String(currentSong.genre)] : [],
          isExplicit: false,
          matureLevel: "safe",
          source: "podcast_rss",
        };

        const playable = podcastEpisodeToAppSong(episode);
        const queue = (activeQueueRef.current || []).map((entry: AppSong) =>
          entry.id === playable.id ? playable : entry
        );
        const index = Math.max(
          0,
          queue.findIndex((entry) => entry.id === playable.id)
        );
        const context =
          activeQueueContextRef.current && isPodcastQueueContext(activeQueueContextRef.current)
            ? activeQueueContextRef.current
            : buildPodcastQueueContext({
                showId: episode.showId,
                showTitle: episode.showTitle,
                categoryId: episode.categories[0],
              });

        resetPodcastSkipFailures();
        await playSong(playable, queue, index, context, "standard");
      } catch (error) {
        if (__DEV__) {
          console.warn("[podcast] resolve-on-demand failed", {
            episodeId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        if (canPodcastSkipInvalidNext()) {
          bumpPodcastSkipFailure();
          try {
            await nextSong();
          } catch {
            // stop cleanly
          }
        }
      } finally {
        if (resolvingRef.current === songId) resolvingRef.current = null;
      }
    })();
  }, [
    activeQueue,
    activeQueueContext,
    activeQueueIndex,
    currentSong,
    currentSong?.id,
    currentSong?.streamUrl,
    currentSong?.url,
    nextSong,
    playSong,
  ]);
}
