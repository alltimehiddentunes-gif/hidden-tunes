import {
  createContext,
  memo,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname } from "expo-router";
import WebView, { type WebViewMessageEvent } from "react-native-webview";

import { COLORS } from "../constants/theme";
import { usePlayerActions } from "./PlayerContext";
import {
  fetchTvPlayback,
  type HiddenTunesTvPlayback,
  type HiddenTunesTvVideo,
} from "../services/tvCatalogApi";

type TvPlaybackResult =
  | { ok: true }
  | { ok: false; error: string };

type TvPlaybackContextValue = {
  currentTvChannel: HiddenTunesTvVideo | null;
  isTvPlaying: boolean;
  tvQueue: HiddenTunesTvVideo[];
  isTvMinimized: boolean;
  playTvChannel: (
    channel: HiddenTunesTvVideo,
    queue?: HiddenTunesTvVideo[]
  ) => Promise<TvPlaybackResult>;
  stopTv: () => void;
  nextTvChannel: () => void;
  previousTvChannel: () => void;
  minimizeTv: () => void;
  restoreTv: () => void;
};

const TvPlaybackContext = createContext<TvPlaybackContextValue | null>(null);

function isHlsLikeSource(sourceType: string) {
  const normalized = sourceType.trim().toLowerCase();
  return (
    normalized === "hls_stream" ||
    normalized === "m3u_playlist" ||
    normalized.endsWith("_stream")
  );
}

function sanitizeYouTubeVideoId(value: unknown) {
  const text = String(value || "").replace("youtube-", "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;

  try {
    const url = new URL(text);
    const watchId = url.searchParams.get("v") || "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(watchId)) return watchId;

    const pathMatch = url.pathname.match(/\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/);
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
        window.stopTv = function () {
          try {
            video.pause();
            video.removeAttribute("src");
            video.load();
          } catch (error) {}
        };
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
      src="${embedUrl}"
      title="Hidden Tunes TV"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
    ></iframe>
  </body>
</html>`;
}

function playbackToHtml(playback: HiddenTunesTvPlayback) {
  if (isHlsLikeSource(playback.source_type)) {
    return buildHlsPlayerHtml(playback.stream_url);
  }

  const videoId = sanitizeYouTubeVideoId(playback.source_id || playback.stream_url);
  return videoId ? buildYouTubePlayerHtml(videoId) : buildHlsPlayerHtml(playback.stream_url);
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

function FloatingTvPlayer({
  channel,
  html,
  isPlaying,
  loading,
  minimized,
  onMessage,
  onStop,
  onNext,
  onPrevious,
  onMinimize,
  onRestore,
}: {
  channel: HiddenTunesTvVideo | null;
  html: string;
  isPlaying: boolean;
  loading: boolean;
  minimized: boolean;
  onMessage: (event: WebViewMessageEvent) => void;
  onStop: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onMinimize: () => void;
  onRestore: () => void;
}) {
  const pathname = usePathname();
  if (!channel || !html) return null;

  const compact = minimized || pathname !== "/tv";

  return (
    <View style={[styles.floating, compact && styles.floatingCompact]}>
      <View style={styles.floatingHeader}>
        <View style={styles.floatingCopy}>
          <Text numberOfLines={1} style={styles.floatingTitle}>
            {channel.title}
          </Text>
          <Text numberOfLines={1} style={styles.floatingSub}>
            {isPlaying ? "Live TV playing" : "Live TV paused"}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.86}
          style={styles.headerIcon}
          onPress={compact ? onRestore : onMinimize}
        >
          <Ionicons
            name={compact ? "expand-outline" : "contract-outline"}
            size={17}
            color={COLORS.text}
          />
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.86} style={styles.headerIcon} onPress={onStop}>
          <Ionicons name="close" size={18} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.videoWrap, compact && styles.videoWrapCompact]}>
        <WebView
          source={{ html }}
          style={styles.webView}
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled={false}
          cacheEnabled={false}
          incognito
          onMessage={onMessage}
        />
        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : null}
      </View>

      <View style={styles.controls}>
        <TouchableOpacity activeOpacity={0.86} style={styles.controlButton} onPress={onPrevious}>
          <Ionicons name="play-skip-back" size={17} color={COLORS.text} />
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.86} style={styles.stopButton} onPress={onStop}>
          <Ionicons name="stop" size={17} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.86} style={styles.controlButton} onPress={onNext}>
          <Ionicons name="play-skip-forward" size={17} color={COLORS.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function TvPlaybackProvider({ children }: { children: ReactNode }) {
  const { stopPlayback } = usePlayerActions();
  const [currentTvChannel, setCurrentTvChannel] =
    useState<HiddenTunesTvVideo | null>(null);
  const [currentPlayback, setCurrentPlayback] =
    useState<HiddenTunesTvPlayback | null>(null);
  const [tvQueue, setTvQueue] = useState<HiddenTunesTvVideo[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isTvPlaying, setIsTvPlaying] = useState(false);
  const [isTvLoading, setIsTvLoading] = useState(false);
  const [isTvMinimized, setIsTvMinimized] = useState(true);
  const requestRef = useRef(0);

  const playTvChannel = useCallback(
    async (
      channel: HiddenTunesTvVideo,
      queue: HiddenTunesTvVideo[] = []
    ): Promise<TvPlaybackResult> => {
      const requestId = ++requestRef.current;
      const nextQueue = dedupeQueue(queue.length ? queue : [channel]);
      const nextIndex = Math.max(
        0,
        nextQueue.findIndex((item) => item.id === channel.id)
      );

      setIsTvLoading(true);

      try {
        await stopPlayback();
      } catch {
        // Music playback owns its own failure handling.
      }

      const fetchedPlayback = await fetchTvPlayback(channel);
      const playback =
        fetchedPlayback?.stream_url
          ? fetchedPlayback
          : channel.source_id
            ? {
                id: channel.id,
                source_type: channel.source_type || "youtube_video",
                source_id: channel.source_id,
                stream_url: `https://www.youtube.com/watch?v=${channel.source_id}`,
                embed_url: null,
              }
            : null;
      if (requestId !== requestRef.current) {
        return { ok: false, error: "TV request was replaced." };
      }

      if (!playback?.stream_url) {
        setIsTvLoading(false);
        return {
          ok: false,
          error: "This TV channel is not playable right now.",
        };
      }

      setTvQueue(nextQueue);
      setQueueIndex(nextIndex);
      setCurrentTvChannel(channel);
      setCurrentPlayback(playback);
      setIsTvPlaying(true);
      setIsTvLoading(false);
      setIsTvMinimized(false);

      return { ok: true };
    },
    [stopPlayback]
  );

  const stopTv = useCallback(() => {
    requestRef.current += 1;
    setCurrentTvChannel(null);
    setCurrentPlayback(null);
    setTvQueue([]);
    setQueueIndex(0);
    setIsTvPlaying(false);
    setIsTvLoading(false);
    setIsTvMinimized(true);
  }, []);

  const playQueueIndex = useCallback(
    (nextIndex: number) => {
      if (!tvQueue.length) return;
      const bounded = ((nextIndex % tvQueue.length) + tvQueue.length) % tvQueue.length;
      const channel = tvQueue[bounded];
      if (!channel) return;
      void playTvChannel(channel, tvQueue);
    },
    [playTvChannel, tvQueue]
  );

  const nextTvChannel = useCallback(() => {
    playQueueIndex(queueIndex + 1);
  }, [playQueueIndex, queueIndex]);

  const previousTvChannel = useCallback(() => {
    playQueueIndex(queueIndex - 1);
  }, [playQueueIndex, queueIndex]);

  const minimizeTv = useCallback(() => {
    setIsTvMinimized(true);
  }, []);

  const restoreTv = useCallback(() => {
    setIsTvMinimized(false);
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const message = String(event.nativeEvent.data || "");
    if (message === "playing") {
      setIsTvPlaying(true);
      setIsTvLoading(false);
      return;
    }
    if (message === "paused") {
      setIsTvPlaying(false);
      return;
    }
    if (message === "error") {
      setIsTvLoading(false);
    }
  }, []);

  const html = useMemo(
    () => (currentPlayback ? playbackToHtml(currentPlayback) : ""),
    [currentPlayback]
  );

  const value = useMemo<TvPlaybackContextValue>(
    () => ({
      currentTvChannel,
      isTvPlaying,
      tvQueue,
      isTvMinimized,
      playTvChannel,
      stopTv,
      nextTvChannel,
      previousTvChannel,
      minimizeTv,
      restoreTv,
    }),
    [
      currentTvChannel,
      isTvMinimized,
      isTvPlaying,
      minimizeTv,
      nextTvChannel,
      playTvChannel,
      previousTvChannel,
      restoreTv,
      stopTv,
      tvQueue,
    ]
  );

  return (
    <TvPlaybackContext.Provider value={value}>
      {children}
      <FloatingTvPlayer
        channel={currentTvChannel}
        html={html}
        isPlaying={isTvPlaying}
        loading={isTvLoading}
        minimized={isTvMinimized}
        onMessage={handleMessage}
        onStop={stopTv}
        onNext={nextTvChannel}
        onPrevious={previousTvChannel}
        onMinimize={minimizeTv}
        onRestore={restoreTv}
      />
    </TvPlaybackContext.Provider>
  );
}

export function useTvPlayback() {
  const context = useContext(TvPlaybackContext);
  if (!context) {
    throw new Error("useTvPlayback must be used within TvPlaybackProvider");
  }
  return context;
}

const styles = StyleSheet.create({
  floating: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 22,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(8,8,12,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    zIndex: 200,
    elevation: 20,
  },
  floatingCompact: {
    left: 16,
    right: 16,
  },
  floatingHeader: {
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  floatingCopy: {
    flex: 1,
  },
  floatingTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },
  floatingSub: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  videoWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
  },
  videoWrapCompact: {
    height: 78,
    aspectRatio: undefined,
  },
  webView: {
    flex: 1,
    backgroundColor: "#000",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  controls: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  controlButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  stopButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
});
