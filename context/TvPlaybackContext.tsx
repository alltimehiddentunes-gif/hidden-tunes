import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { router } from "expo-router";
import WebView, { type WebViewMessageEvent } from "react-native-webview";

import TvPlayerHost from "../components/tv/TvPlayerHost";
import type { TvNativeVideoHandle } from "../components/tv/TvNativeVideoSurface";
import { usePlayerActions } from "./PlayerContext";
import { getTvChannelById } from "../data/tvChannelSeedCatalog";
import {
  fetchTvPlayback,
  type HiddenTunesTvPlayback,
  type HiddenTunesTvVideo,
} from "../services/tvCatalogApi";
import {
  beginTvMediaTransition,
  invalidateTvMediaTransitions,
  isCurrentTvMediaTransition,
} from "../services/tv/tvMediaHandoff";
import { setTvSessionActive } from "../services/tv/tvPlaybackActivity";
import {
  resolveTvPlaybackSurface,
  type TvPlaybackSurface,
} from "../services/tv/tvPlaybackSurface";
import { clearTvPlaybackSession } from "../services/tv/tvPlaybackSession";
import { recordTvRecentlyWatched } from "../services/tv/tvRecentlyWatched";
import {
  registerTvSessionController,
  type StartCatalogTvSessionInput,
  type StartResolvedTvSessionInput,
  type StartSeedTvSessionInput,
  type TvSessionStartResult,
} from "../services/tv/tvSessionController";
import type {
  TVChannel,
  TvLiveSectionId,
  TvPresentationMode,
} from "../types/tv";
import {
  getNowPlayingSnapshot,
  subscribeNowPlaying,
} from "../utils/nowPlayingStore";

type TvPlaybackResult = TvSessionStartResult;

type TvPlaybackContextValue = {
  currentTvChannel: HiddenTunesTvVideo | null;
  isTvPlaying: boolean;
  tvQueue: HiddenTunesTvVideo[];
  isTvMinimized: boolean;
  presentationMode: TvPresentationMode;
  playTvChannel: (
    channel: HiddenTunesTvVideo,
    queue?: HiddenTunesTvVideo[]
  ) => Promise<TvPlaybackResult>;
  stopTv: () => void;
  nextTvChannel: () => void;
  previousTvChannel: () => void;
  minimizeTv: () => void;
  restoreTv: () => void;
  setPresentationMode: (mode: TvPresentationMode) => void;
};

const TvPlaybackContext = createContext<TvPlaybackContextValue | null>(null);

function isHlsLikeSource(sourceType: string) {
  const normalized = sourceType.trim().toLowerCase();
  return (
    normalized === "hls_stream" ||
    normalized === "m3u_playlist" ||
    normalized.endsWith("_stream") ||
    normalized === "official_stream" ||
    normalized === "mp4"
  );
}

function sanitizeYouTubeVideoId(value: unknown) {
  const text = String(value || "").replace("youtube-", "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;

  try {
    const url = new URL(text);
    const watchId = url.searchParams.get("v") || "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(watchId)) return watchId;

    const pathMatch = url.pathname.match(
      /\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/
    );
    if (pathMatch?.[1]) return pathMatch[1];

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "").trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
  } catch {}

  const match = text.match(/[a-zA-Z0-9_-]{11}/);
  return match ? match[0] : "";
}

function buildHlsPlayerHtml(streamUrl: string) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
      video { width: 100%; height: 100%; object-fit: contain; background: #000; }
    </style>
  </head>
  <body>
    <video id="player" playsinline controls autoplay></video>
    <script>
      (function () {
        function post(message) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(String(message));
          }
        }
        var video = document.getElementById("player");
        video.addEventListener("playing", function () { post("playing"); });
        video.addEventListener("loadeddata", function () { post("playing"); });
        video.addEventListener("pause", function () { post("paused"); });
        video.addEventListener("error", function () { post("error"); });
        try {
          video.src = ${JSON.stringify(streamUrl)};
          var playPromise = video.play();
          if (playPromise && playPromise.catch) {
            playPromise.catch(function () { post("error"); });
          }
        } catch (error) {
          post("error");
        }
        window.togglePlayback = function (shouldPlay) {
          if (!video) return;
          if (shouldPlay) {
            video.play().catch(function () { post("error"); });
          } else {
            video.pause();
          }
        };
        window.stopTv = function () {
          try {
            video.pause();
            video.removeAttribute("src");
            video.load();
          } catch (error) {}
        };
        setTimeout(function () {
          if (video && video.readyState < 2 && !video.error) {
            post("timeout");
          }
        }, 12000);
      })();
    </script>
  </body>
</html>`;
}

function buildYouTubePlayerHtml(sourceId: string) {
  const embedUrl =
    `https://www.youtube.com/embed/${encodeURIComponent(sourceId)}` +
    "?playsinline=1&autoplay=1&rel=0&modestbranding=1";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body, iframe { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; border: 0; }
    </style>
  </head>
  <body>
    <iframe
      id="yt"
      src="${embedUrl}"
      title="Hidden Tunes TV"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
    ></iframe>
    <script>
      (function () {
        function post(message) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(String(message));
          }
        }
        var iframe = document.getElementById("yt");
        var posted = false;
        function markPlaying() {
          if (posted) return;
          posted = true;
          post("playing");
        }
        if (iframe) {
          iframe.addEventListener("load", markPlaying);
        }
        // YouTube iframe API is not wired; clear preparing once the embed has mounted.
        setTimeout(markPlaying, 1200);
      })();
    </script>
  </body>
</html>`;
}

function playbackToHtml(playback: HiddenTunesTvPlayback) {
  if (isHlsLikeSource(playback.source_type)) {
    return buildHlsPlayerHtml(playback.stream_url);
  }

  const videoId = sanitizeYouTubeVideoId(
    playback.source_id || playback.stream_url
  );
  return videoId
    ? buildYouTubePlayerHtml(videoId)
    : buildHlsPlayerHtml(playback.stream_url);
}

function dedupeQueue(queue: HiddenTunesTvVideo[]) {
  const seen = new Set<string>();
  const deduped: HiddenTunesTvVideo[] = [];

  for (const item of queue) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }

  return deduped;
}

function seedChannelToVideo(channel: TVChannel): HiddenTunesTvVideo {
  return {
    id: channel.id,
    title: channel.name,
    description: channel.description || null,
    logo: channel.logoUrl || null,
    thumbnail_url: channel.logoUrl || null,
    country: channel.country || null,
    language: channel.language || null,
    categories: [channel.category],
    source_type: "hls_stream",
    channel_name: channel.name,
  };
}

function seedPlayback(channel: TVChannel): HiddenTunesTvPlayback {
  return {
    id: channel.id,
    source_type:
      channel.streamType === "web" ? "youtube_video" : "hls_stream",
    source_id: "",
    stream_url: channel.streamUrl,
    embed_url: null,
  };
}

export function TvPlaybackProvider({ children }: { children: ReactNode }) {
  const { stopPlayback } = usePlayerActions();
  const webViewRef = useRef<WebView | null>(null);
  const nativePlayerRef = useRef<TvNativeVideoHandle | null>(null);
  const sessionIdRef = useRef(0);
  const watchedSavedRef = useRef<string | null>(null);
  const isPlayingRef = useRef(false);
  const surfaceRef = useRef<TvPlaybackSurface>("native");

  const [currentItem, setCurrentItem] = useState<HiddenTunesTvVideo | null>(
    null
  );
  const [currentPlayback, setCurrentPlayback] =
    useState<HiddenTunesTvPlayback | null>(null);
  const [tvQueue, setTvQueue] = useState<HiddenTunesTvVideo[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [seedChannel, setSeedChannel] = useState<TVChannel | null>(null);
  const [seedQueueIds, setSeedQueueIds] = useState<string[]>([]);
  const [sectionId, setSectionId] = useState<TvLiveSectionId | null>(null);
  const [presentationMode, setPresentationModeState] =
    useState<TvPresentationMode>("closed");
  const [isTvPlaying, setIsTvPlaying] = useState(false);
  const [isTvLoading, setIsTvLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [playerGeneration, setPlayerGeneration] = useState(0);
  const [surface, setSurface] = useState<TvPlaybackSurface>("native");

  const activeItemIdRef = useRef<string | null>(null);
  activeItemIdRef.current = currentItem?.id ?? null;
  const sessionActiveRef = useRef(false);
  sessionActiveRef.current = Boolean(currentItem && currentPlayback);
  isPlayingRef.current = isTvPlaying;
  surfaceRef.current = surface;

  // Playing proves the stream is live — never keep a preparing spinner on top of it.
  useEffect(() => {
    if (isTvPlaying) {
      setIsTvLoading(false);
    }
  }, [isTvPlaying]);

  const unloadSurface = useCallback(() => {
    try {
      nativePlayerRef.current?.unload();
    } catch {
      // Best-effort native unload.
    }
    try {
      webViewRef.current?.injectJavaScript(
        `try { window.stopTv && window.stopTv(); } catch (e) {} true;`
      );
      webViewRef.current?.stopLoading?.();
    } catch {
      // Best-effort WebView unload.
    }
  }, []);

  const stopTv = useCallback(() => {
    sessionIdRef.current += 1;
    invalidateTvMediaTransitions();
    unloadSurface();
    setCurrentItem(null);
    setCurrentPlayback(null);
    setTvQueue([]);
    setQueueIndex(0);
    setSeedChannel(null);
    setSeedQueueIds([]);
    setSectionId(null);
    setPresentationModeState("closed");
    setIsTvPlaying(false);
    setIsTvLoading(false);
    setHasError(false);
    setTvSessionActive(false);
    clearTvPlaybackSession();
    watchedSavedRef.current = null;
    sessionActiveRef.current = false;
    activeItemIdRef.current = null;
  }, [unloadSurface]);

  const setPresentationMode = useCallback((mode: TvPresentationMode) => {
    if (mode === "closed") return;
    setPresentationModeState(mode);
  }, []);

  const applyResolvedSession = useCallback(
    (input: {
      item: HiddenTunesTvVideo;
      playback: HiddenTunesTvPlayback;
      queue: HiddenTunesTvVideo[];
      index: number;
      presentation: Exclude<TvPresentationMode, "closed">;
      seed?: TVChannel | null;
      seedIds?: string[];
      section?: TvLiveSectionId | null;
    }) => {
      unloadSurface();
      const nextSurface = resolveTvPlaybackSurface(input.playback);
      setSurface(nextSurface);
      surfaceRef.current = nextSurface;
      setCurrentItem(input.item);
      setCurrentPlayback(input.playback);
      setTvQueue(input.queue);
      setQueueIndex(input.index);
      setSeedChannel(input.seed ?? null);
      setSeedQueueIds(input.seedIds ?? []);
      setSectionId(input.section ?? null);
      setPresentationModeState(input.presentation);
      // Optimistic session start — preparing until native/WebView confirms playback.
      setIsTvPlaying(false);
      setIsTvLoading(true);
      setHasError(false);
      setPlayerGeneration((value) => value + 1);
      setTvSessionActive(true);
      sessionActiveRef.current = true;
      activeItemIdRef.current = input.item.id;

      if (input.seed && watchedSavedRef.current !== input.seed.id) {
        watchedSavedRef.current = input.seed.id;
        void recordTvRecentlyWatched(input.seed);
      }
    },
    [unloadSurface]
  );

  const startResolvedSession = useCallback(
    async (
      input: StartResolvedTvSessionInput
    ): Promise<TvSessionStartResult> => {
      const { transitionId } = beginTvMediaTransition();
      const sessionId = ++sessionIdRef.current;
      const presentation =
        input.presentation === "fullPlayer" ? "fullPlayer" : "floating";

      try {
        await stopPlayback();
      } catch {
        // Music owns its failure handling.
      }

      if (
        sessionId !== sessionIdRef.current ||
        !isCurrentTvMediaTransition(transitionId)
      ) {
        return { ok: false, error: "TV request was replaced." };
      }

      if (!input.playback?.stream_url) {
        return {
          ok: false,
          error: "This TV channel is not playable right now.",
        };
      }

      const queue = dedupeQueue(
        input.queue?.length ? input.queue : [input.item]
      );
      const index = Math.max(
        0,
        queue.findIndex((entry) => entry.id === input.item.id)
      );

      applyResolvedSession({
        item: input.item,
        playback: input.playback,
        queue,
        index,
        presentation,
        seed: input.seedChannel ?? null,
        seedIds: input.seedQueueIds,
        section: input.sectionId ?? null,
      });

      return { ok: true };
    },
    [applyResolvedSession, stopPlayback]
  );

  const startCatalogSession = useCallback(
    async (
      input: StartCatalogTvSessionInput
    ): Promise<TvSessionStartResult> => {
      const { transitionId } = beginTvMediaTransition();
      const sessionId = ++sessionIdRef.current;
      const presentation =
        input.presentation === "fullPlayer" ? "fullPlayer" : "floating";

      setIsTvLoading(true);

      try {
        await stopPlayback();
      } catch {
        // Music owns its failure handling.
      }

      if (
        sessionId !== sessionIdRef.current ||
        !isCurrentTvMediaTransition(transitionId)
      ) {
        return { ok: false, error: "TV request was replaced." };
      }

      let playback = input.playback ?? null;
      if (!playback?.stream_url) {
        try {
          playback = await fetchTvPlayback(input.video);
        } catch {
          if (
            sessionId !== sessionIdRef.current ||
            !isCurrentTvMediaTransition(transitionId)
          ) {
            return { ok: false, error: "TV request was replaced." };
          }
          playback = null;
        }
      }

      if (
        sessionId !== sessionIdRef.current ||
        !isCurrentTvMediaTransition(transitionId)
      ) {
        return { ok: false, error: "TV request was replaced." };
      }

      if (!playback?.stream_url) {
        if (input.video.source_id && !isHlsLikeSource(input.video.source_type || "")) {
          playback = {
            id: input.video.id,
            source_type: input.video.source_type || "youtube_video",
            source_id: input.video.source_id,
            stream_url: `https://www.youtube.com/watch?v=${input.video.source_id}`,
            embed_url: null,
          };
        } else {
          setIsTvLoading(false);
          return {
            ok: false,
            error: "This TV channel is not playable right now.",
          };
        }
      }

      const queue = dedupeQueue(
        input.queue?.length ? input.queue : [input.video]
      );
      const index = Math.max(
        0,
        queue.findIndex((entry) => entry.id === input.video.id)
      );

      applyResolvedSession({
        item: input.video,
        playback,
        queue,
        index,
        presentation,
      });

      return { ok: true };
    },
    [applyResolvedSession, stopPlayback]
  );

  const startSeedSession = useCallback(
    async (input: StartSeedTvSessionInput): Promise<TvSessionStartResult> => {
      if (!input.channel.streamUrl || input.channel.streamType === "web") {
        return {
          ok: false,
          error: "This TV channel is not playable right now.",
        };
      }

      return startResolvedSession({
        item: seedChannelToVideo(input.channel),
        playback: seedPlayback(input.channel),
        queue: input.channelIds
          .map((id) => getTvChannelById(id))
          .filter((entry): entry is TVChannel => Boolean(entry))
          .map(seedChannelToVideo),
        presentation: input.presentation || "fullPlayer",
        seedChannel: input.channel,
        sectionId: input.sectionId,
        seedQueueIds: input.channelIds,
      });
    },
    [startResolvedSession]
  );

  const playTvChannel = useCallback(
    async (
      channel: HiddenTunesTvVideo,
      queue: HiddenTunesTvVideo[] = []
    ): Promise<TvPlaybackResult> => {
      return startCatalogSession({
        video: channel,
        queue,
        presentation: "floating",
      });
    },
    [startCatalogSession]
  );

  const playQueueIndex = useCallback(
    (nextIndex: number) => {
      if (seedQueueIds.length && seedChannel) {
        const bounded =
          ((nextIndex % seedQueueIds.length) + seedQueueIds.length) %
          seedQueueIds.length;
        const nextId = seedQueueIds[bounded];
        const next = nextId ? getTvChannelById(nextId) : null;
        if (!next) return;
        void startSeedSession({
          channel: next,
          sectionId: sectionId || "related",
          channelIds: seedQueueIds,
          presentation:
            presentationMode === "fullPlayer" ? "fullPlayer" : "floating",
        });
        return;
      }

      if (!tvQueue.length) return;
      const bounded =
        ((nextIndex % tvQueue.length) + tvQueue.length) % tvQueue.length;
      const channel = tvQueue[bounded];
      if (!channel) return;
      void startCatalogSession({
        video: channel,
        queue: tvQueue,
        presentation:
          presentationMode === "fullPlayer" ? "fullPlayer" : "floating",
      });
    },
    [
      presentationMode,
      sectionId,
      seedChannel,
      seedQueueIds,
      startCatalogSession,
      startSeedSession,
      tvQueue,
    ]
  );

  const nextTvChannel = useCallback(() => {
    playQueueIndex(queueIndex + 1);
  }, [playQueueIndex, queueIndex]);

  const previousTvChannel = useCallback(() => {
    playQueueIndex(queueIndex - 1);
  }, [playQueueIndex, queueIndex]);

  const minimizeTv = useCallback(() => {
    if (presentationMode === "closed") return;
    setPresentationMode("floating");
  }, [presentationMode, setPresentationMode]);

  const restoreTv = useCallback(() => {
    if (presentationMode === "closed") return;
    setPresentationMode("fullPlayer");
    // Replace (not push) so PiP restore does not stack duplicate /tv-player routes.
    router.replace("/tv-player" as any);
  }, [presentationMode, setPresentationMode]);

  const handleTogglePlayback = useCallback(() => {
    const nextPlaying = !isPlayingRef.current;
    setIsTvPlaying(nextPlaying);
    if (surfaceRef.current === "native") {
      if (nextPlaying) nativePlayerRef.current?.play();
      else nativePlayerRef.current?.pause();
      return;
    }
    webViewRef.current?.injectJavaScript(
      `window.togglePlayback && window.togglePlayback(${
        nextPlaying ? "true" : "false"
      }); true;`
    );
  }, []);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsTvLoading(true);
    setIsTvPlaying(false);
    setPlayerGeneration((value) => value + 1);
  }, []);

  const handleSelectSeedChannel = useCallback(
    (channel: TVChannel) => {
      const ids = seedQueueIds.length
        ? seedQueueIds
        : relatedIdsFallback(channel, seedQueueIds);
      void startSeedSession({
        channel,
        sectionId: "related",
        channelIds: ids.length ? ids : [channel.id],
        presentation: "fullPlayer",
      });
    },
    [seedQueueIds, startSeedSession]
  );

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const message = String(event.nativeEvent.data || "");
    if (message === "playing") {
      setIsTvPlaying(true);
      setIsTvLoading(false);
      setHasError(false);
      return;
    }
    if (message === "paused") {
      setIsTvPlaying(false);
      return;
    }
    if (message === "error" || message === "timeout") {
      setIsTvLoading(false);
      setHasError(true);
      setIsTvPlaying(false);
    }
  }, []);

  const handleNativePlaying = useCallback(() => {
    setIsTvPlaying(true);
    setIsTvLoading(false);
    setHasError(false);
  }, []);

  const handleNativePaused = useCallback(() => {
    setIsTvPlaying(false);
  }, []);

  const handleReportError = useCallback(() => {
    setIsTvLoading(false);
    setHasError(true);
    setIsTvPlaying(false);
  }, []);

  const html = useMemo(() => {
    if (!currentPlayback) return "";
    if (resolveTvPlaybackSurface(currentPlayback) !== "webview") return "";
    return playbackToHtml(currentPlayback);
  }, [currentPlayback]);

  const streamUrl = currentPlayback?.stream_url || "";

  useEffect(() => {
    registerTvSessionController({
      startCatalogSession,
      startSeedSession,
      startResolvedSession,
      stopSession: stopTv,
      setPresentationMode,
      isSessionActive: () => sessionActiveRef.current,
      getActiveItemId: () => activeItemIdRef.current,
    });

    return () => {
      registerTvSessionController(null);
    };
  }, [
    setPresentationMode,
    startCatalogSession,
    startResolvedSession,
    startSeedSession,
    stopTv,
  ]);

  useEffect(() => {
    return () => {
      // Provider unmount (rare): ensure session flag clears.
      setTvSessionActive(false);
    };
  }, []);

  // Direct playSong/playQueue paths bypass usePlaybackRouter ÔÇö stop TV when
  // the shared now-playing snapshot shows audio becoming active.
  useEffect(() => {
    return subscribeNowPlaying(() => {
      if (!sessionActiveRef.current) return;
      const snap = getNowPlayingSnapshot();
      if (!snap.isPlaying || !snap.currentSongId) return;
      stopTv();
    });
  }, [stopTv]);

  const value = useMemo<TvPlaybackContextValue>(
    () => ({
      currentTvChannel: currentItem,
      isTvPlaying,
      tvQueue,
      isTvMinimized: presentationMode === "floating",
      presentationMode,
      playTvChannel,
      stopTv,
      nextTvChannel,
      previousTvChannel,
      minimizeTv,
      restoreTv,
      setPresentationMode,
    }),
    [
      currentItem,
      isTvPlaying,
      minimizeTv,
      nextTvChannel,
      playTvChannel,
      presentationMode,
      previousTvChannel,
      restoreTv,
      setPresentationMode,
      stopTv,
      tvQueue,
    ]
  );

  const showHost =
    presentationMode !== "closed" && currentItem && currentPlayback;

  return (
    <TvPlaybackContext.Provider value={value}>
      {children}
      {showHost ? (
        <TvPlayerHost
          html={html}
          streamUrl={streamUrl}
          surface={surface}
          playerGeneration={playerGeneration}
          presentationMode={presentationMode}
          item={currentItem}
          seedChannel={seedChannel}
          isPlaying={isTvPlaying}
          isLoading={isTvLoading}
          hasError={hasError}
          webViewRef={webViewRef}
          nativePlayerRef={nativePlayerRef}
          onMessage={handleMessage}
          onNativePlaying={handleNativePlaying}
          onNativePaused={handleNativePaused}
          onStop={stopTv}
          onNext={nextTvChannel}
          onPrevious={previousTvChannel}
          onTogglePlayback={handleTogglePlayback}
          onMinimize={minimizeTv}
          onExpand={restoreTv}
          onRetry={handleRetry}
          onSelectSeedChannel={handleSelectSeedChannel}
          onReportError={handleReportError}
        />
      ) : null}
    </TvPlaybackContext.Provider>
  );
}

function relatedIdsFallback(channel: TVChannel, existing: string[]) {
  if (existing.length) return existing;
  return [channel.id];
}

export function useTvPlayback() {
  const context = useContext(TvPlaybackContext);
  if (!context) {
    throw new Error("useTvPlayback must be used within TvPlaybackProvider");
  }
  return context;
}
