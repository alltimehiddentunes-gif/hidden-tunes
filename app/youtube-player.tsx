import { useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import WebView, { type WebViewMessageEvent } from "react-native-webview";

import { COLORS, GRADIENTS } from "../constants/theme";
import { usePlayerActions } from "../context/PlayerContext";

type YouTubeQueueItem = {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  channelTitle: string;
  thumbnail: string;
};

const YOUTUBE_MINI_KEY = "hidden_tunes_current_youtube";
const PRIMARY_EMBED_ORIGIN = "https://hiddentunes.com";
const FALLBACK_EMBED_ORIGIN = "https://lonelycpp.github.io";
const BLOCKED_EXTERNAL_SCHEMES = [
  "youtube://",
  "vnd.youtube:",
  "intent://",
  "market://",
  "itms-apps://",
];

function sanitizeYouTubeVideoId(value: unknown) {
  const text = String(value || "").replace("youtube-", "").trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;

  const match = text.match(/[a-zA-Z0-9_-]{11}/);
  return match ? match[0] : "";
}

function extractVideoIdFromUrl(value: unknown) {
  const raw = String(value || "").replace("youtube-", "").trim();

  if (!raw) return "";
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const watchId = url.searchParams.get("v") || "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(watchId)) return watchId;

    const shortsMatch = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch?.[1]) return shortsMatch[1];

    const embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch?.[1]) return embedMatch[1];

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "").trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
  } catch {}

  const match = raw.match(/[a-zA-Z0-9_-]{11}/);
  return match ? match[0] : "";
}

function isBlockedExternalUrl(url: string) {
  const clean = url.toLowerCase().trim();
  return BLOCKED_EXTERNAL_SCHEMES.some((scheme) => clean.startsWith(scheme));
}

function isAllowedEmbedUrl(url: string) {
  const clean = url.toLowerCase();
  return (
    clean.startsWith("about:blank") ||
    clean.includes("youtube.com/embed/") ||
    clean.includes("youtube-nocookie.com/embed/") ||
    clean.includes("googlevideo.com") ||
    clean.includes("gstatic.com") ||
    clean.includes("google.com") ||
    clean.includes("ytimg.com") ||
    clean.startsWith(PRIMARY_EMBED_ORIGIN.toLowerCase()) ||
    clean.startsWith(FALLBACK_EMBED_ORIGIN.toLowerCase())
  );
}

function buildEmbedPlayerHtml(
  videoId: string,
  pageOrigin: string,
  autoplay = true
) {
  const autoplayFlag = autoplay ? "1" : "0";
  const embedUrl =
    `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` +
    `?playsinline=1&enablejsapi=1&origin=${encodeURIComponent(pageOrigin)}` +
    `&rel=0&modestbranding=1&autoplay=${autoplayFlag}`;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #000;
      }
      iframe {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: 0;
      }
    </style>
  </head>
  <body>
    <iframe
      id="ht-youtube-player"
      src="${embedUrl}"
      title="Hidden Tunes TV"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
    <script>
      (function () {
        function post(message) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(String(message));
          }
        }

        window.addEventListener("message", function (event) {
          if (!event || !event.origin || event.origin.indexOf("youtube") === -1) {
            return;
          }

          try {
            var payload =
              typeof event.data === "string" ? JSON.parse(event.data) : event.data;

            if (!payload || !payload.event) return;

            if (payload.event === "onStateChange") {
              if (payload.info === 1) post("playing");
              if (payload.info === 2) post("paused");
              if (payload.info === 0) post("ended");
            }

            if (payload.event === "onError") {
              post("embed-error-" + String(payload.info || "unknown"));
            }
          } catch (error) {}
        });

        setTimeout(function () {
          post("embed-timeout-check");
        }, 12000);
      })();
    </script>
  </body>
</html>`;
}

function normalizeQueueItem(item: any): YouTubeQueueItem | null {
  const videoId = sanitizeYouTubeVideoId(
    item?.videoId || item?.source_id || item?.id
  );

  if (!videoId) return null;

  const artist = String(item?.artist || item?.channelTitle || "YouTube");
  const thumbnail = String(item?.thumbnail || item?.cover || item?.artwork || "");

  return {
    id: videoId,
    videoId,
    title: String(item?.title || "YouTube Music"),
    artist,
    channelTitle: String(item?.channelTitle || artist),
    thumbnail,
  };
}

export default function YouTubePlayerScreen() {
  const params = useLocalSearchParams();
  const webViewRef = useRef<WebView | null>(null);

  const { stopPlayback } = usePlayerActions();

  const startedAtRef = useRef<number>(Date.now());
  const autoNextLockRef = useRef(false);
  const errorSkipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialVideoId = sanitizeYouTubeVideoId(
    params.source_id || params.videoId || params.id
  );
  const initialTitle = String(params.title || "YouTube Music");
  const initialArtist = String(
    params.artist || params.channelTitle || "Hidden Tunes TV"
  );

  const parsedQueue: YouTubeQueueItem[] = useMemo(() => {
    try {
      const parsed = params.queue ? JSON.parse(String(params.queue)) : [];

      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map((item) => normalizeQueueItem(item))
          .filter((item): item is YouTubeQueueItem => item !== null);
      }
    } catch {}

    const fallbackItem = normalizeQueueItem({
      id: initialVideoId,
      videoId: initialVideoId,
      source_id: initialVideoId,
      title: initialTitle,
      artist: initialArtist,
      channelTitle: initialArtist,
      thumbnail: String(params.thumbnail || ""),
    });

    return fallbackItem ? [fallbackItem] : [];
  }, [
    params.queue,
    params.thumbnail,
    initialVideoId,
    initialTitle,
    initialArtist,
  ]);

  const startIndex = useMemo(() => {
    const paramIndex = Number(params.startIndex || 0);

    if (!Number.isNaN(paramIndex) && paramIndex >= 0) {
      return Math.min(paramIndex, Math.max(parsedQueue.length - 1, 0));
    }

    const foundIndex = parsedQueue.findIndex(
      (item) => item.videoId === initialVideoId
    );

    return foundIndex >= 0 ? foundIndex : 0;
  }, [params.startIndex, parsedQueue, initialVideoId]);

  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [playerStatus, setPlayerStatus] = useState("Preparing video...");
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const [embedPageOrigin, setEmbedPageOrigin] = useState(PRIMARY_EMBED_ORIGIN);

  const queue = parsedQueue;
  const currentVideo = queue[currentIndex] || queue[0];

  const videoId = currentVideo?.videoId || initialVideoId;
  const title = currentVideo?.title || initialTitle;
  const artist =
    currentVideo?.artist ||
    currentVideo?.channelTitle ||
    initialArtist ||
    "YouTube";

  const thumbnail = currentVideo?.thumbnail || String(params.thumbnail || "");

  const playerReadyRef = useRef(false);

  const embedHtml = useMemo(
    () => (videoId ? buildEmbedPlayerHtml(videoId, embedPageOrigin, true) : ""),
    [embedPageOrigin, videoId]
  );

  useEffect(() => {
    stopPlayback?.();

    return () => {
      if (errorSkipTimerRef.current) {
        clearTimeout(errorSkipTimerRef.current);
      }

      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    saveYouTubeMini();

    startedAtRef.current = Date.now();
    autoNextLockRef.current = false;
    setIsVideoPlaying(true);
    playerReadyRef.current = false;
    setEmbedPageOrigin(PRIMARY_EMBED_ORIGIN);
    setPlayerReady(false);
    setPlayerStatus("Preparing video...");

    if (errorSkipTimerRef.current) {
      clearTimeout(errorSkipTimerRef.current);
      errorSkipTimerRef.current = null;
    }

    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
    }

    playbackTimerRef.current = setTimeout(() => {
      if (!playerReadyRef.current) {
        scheduleEmbedErrorSkip("embed-timeout");
      }
    }, 12000);
  }, [videoId, title, artist, thumbnail]);

  async function saveYouTubeMini() {
    if (!videoId) return;

    try {
      await AsyncStorage.setItem(
        YOUTUBE_MINI_KEY,
        JSON.stringify({
          id: videoId,
          videoId,
          title,
          channelTitle: artist,
          artist,
          thumbnail,
        })
      );
    } catch {}
  }

  function playAtIndex(index: number) {
    if (!queue.length) return;

    const safeIndex = Math.max(0, Math.min(index, queue.length - 1));

    startedAtRef.current = Date.now();
    autoNextLockRef.current = false;
    setIsVideoPlaying(true);
    playerReadyRef.current = false;
    setEmbedPageOrigin(PRIMARY_EMBED_ORIGIN);
    setPlayerReady(false);
    setPlayerStatus("Preparing video...");
    setCurrentIndex(safeIndex);
  }

  function playNext() {
    if (queue.length <= 1) {
      setPlayerStatus("Add more videos from Hidden Tunes TV to keep watching.");
      return;
    }

    const next = currentIndex + 1;
    playAtIndex(next >= queue.length ? 0 : next);
  }

  function playPrevious() {
    if (queue.length <= 1) {
      setPlayerStatus("You're at the start of this queue.");
      return;
    }

    const previous = currentIndex - 1;
    playAtIndex(previous < 0 ? queue.length - 1 : previous);
  }

  function togglePlayPause() {
    if (!playerReady) {
      setPlayerStatus("Almost ready. Try again in a moment.");
      return;
    }

    const nextPlaying = !isVideoPlaying;
    const command = nextPlaying ? "playVideo" : "pauseVideo";

    webViewRef.current?.injectJavaScript(`
      (function () {
        var frame = document.getElementById("ht-youtube-player");
        if (!frame || !frame.contentWindow) return true;
        frame.contentWindow.postMessage(
          JSON.stringify({ event: "command", func: "${command}", args: "" }),
          "*"
        );
        return true;
      })();
      true;
    `);

    setIsVideoPlaying(nextPlaying);
    setPlayerStatus(nextPlaying ? "Playing" : "Paused");
  }

  function scheduleEmbedErrorSkip(reason: string) {
    if (errorSkipTimerRef.current) return;

    errorSkipTimerRef.current = setTimeout(() => {
      errorSkipTimerRef.current = null;
      setPlayerStatus("Skipping unavailable video...");
      safeAutoNext(reason, true);
    }, 900);
  }

  function safeAutoNext(_reason: string, allowEarlySkip = false) {
    const watchedMs = Date.now() - startedAtRef.current;

    if (autoNextLockRef.current) return;

    if (!allowEarlySkip && watchedMs < 3000) {
      setPlayerStatus("Playing next...");
      return;
    }

    if (queue.length <= 1) {
      setIsVideoPlaying(false);
      setPlayerStatus("This video is unavailable in Hidden Tunes TV.");
      return;
    }

    autoNextLockRef.current = true;
    setIsVideoPlaying(false);
    setPlayerStatus("Playing next...");

    setTimeout(() => {
      playNext();
    }, 400);

    setTimeout(() => {
      autoNextLockRef.current = false;
    }, 1800);
  }

  function handleWebViewMessage(event: WebViewMessageEvent) {
    const message = String(event.nativeEvent.data || "");

    if (message === "playing") {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }

      playerReadyRef.current = true;
      setIsVideoPlaying(true);
      setPlayerReady(true);
      setPlayerStatus("Playing");
      return;
    }

    if (message === "paused") {
      setIsVideoPlaying(false);
      setPlayerStatus("Paused");
      return;
    }

    if (message === "ended") {
      setIsVideoPlaying(false);
      safeAutoNext("youtube-ended");
      return;
    }

    if (message === "embed-timeout-check" && !playerReadyRef.current) {
      scheduleEmbedErrorSkip("embed-timeout");
      return;
    }

    if (message.startsWith("embed-error-")) {
      const errorCode = message.replace("embed-error-", "");
      setIsVideoPlaying(false);
      setPlayerReady(true);

      if (
        (errorCode === "153" || errorCode === "150" || errorCode === "101") &&
        embedPageOrigin === PRIMARY_EMBED_ORIGIN
      ) {
        setPlayerStatus("Retrying playback...");
        setEmbedPageOrigin(FALLBACK_EMBED_ORIGIN);
        return;
      }

      if (errorCode === "153" || errorCode === "150" || errorCode === "101") {
        setPlayerStatus("Video unavailable here. Skipping to next...");
        scheduleEmbedErrorSkip(`embed-error-${errorCode}`);
        return;
      }

      setPlayerStatus("This video can't play here. Skipping to next...");
      scheduleEmbedErrorSkip(message);
    }
  }

  function handleInAppWebViewNavigation(request: { url: string }) {
    const requestUrl = String(request.url || "");

    if (!requestUrl) return true;
    if (isBlockedExternalUrl(requestUrl)) {
      setPlayerStatus("Playback stays inside Hidden Tunes.");
      return false;
    }

    const linkedVideoId = extractVideoIdFromUrl(requestUrl);

    if (
      linkedVideoId &&
      linkedVideoId !== videoId &&
      (requestUrl.includes("/watch") ||
        requestUrl.includes("/shorts/") ||
        requestUrl.includes("youtu.be/"))
    ) {
      router.replace({
        pathname: "/youtube-player",
        params: {
          id: linkedVideoId,
          videoId: linkedVideoId,
          source_id: linkedVideoId,
          title: "Hidden Tunes TV",
          artist: "Hidden Tunes TV",
          channelTitle: "Hidden Tunes TV",
          thumbnail: `https://img.youtube.com/vi/${linkedVideoId}/hqdefault.jpg`,
        },
      } as any);
      return false;
    }

    if (!isAllowedEmbedUrl(requestUrl)) {
      setPlayerStatus("Playback stays inside Hidden Tunes.");
      return false;
    }

    return true;
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />

      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.topTextBox}>
          <Text style={styles.label}>HIDDEN TUNES TV</Text>
          <Text numberOfLines={1} style={styles.topTitle}>
            Hidden Tunes TV
          </Text>
        </View>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.push("/queue" as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="list" size={21} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.playerFrame}>
        {videoId && embedHtml ? (
          <WebView
            ref={webViewRef}
            key={`tv-embed-${videoId}-${embedPageOrigin}`}
            source={{
              html: embedHtml,
              baseUrl: embedPageOrigin,
              headers: {
                Referer: `${embedPageOrigin}/`,
              },
            }}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            allowsProtectedMedia
            mediaPlaybackRequiresUserAction={false}
            thirdPartyCookiesEnabled
            mixedContentMode="always"
            setSupportMultipleWindows={false}
            sharedCookiesEnabled
            startInLoadingState
            onLoadEnd={() => {
              playerReadyRef.current = true;
              setPlayerReady(true);
              setPlayerStatus("Ready when you are. Tap play if needed.");
            }}
            onError={() => {
              if (embedPageOrigin === PRIMARY_EMBED_ORIGIN) {
                setPlayerStatus("Retrying playback...");
                setEmbedPageOrigin(FALLBACK_EMBED_ORIGIN);
                return;
              }

              setPlayerStatus("Playback failed. Skipping to next...");
              scheduleEmbedErrorSkip("webview-error");
            }}
            onHttpError={() => {
              if (embedPageOrigin === PRIMARY_EMBED_ORIGIN) {
                setPlayerStatus("Retrying playback...");
                setEmbedPageOrigin(FALLBACK_EMBED_ORIGIN);
                return;
              }

              setPlayerStatus("Playback failed. Skipping to next...");
              scheduleEmbedErrorSkip("webview-http-error");
            }}
            onMessage={handleWebViewMessage}
            onShouldStartLoadWithRequest={handleInAppWebViewNavigation}
            style={styles.youtubeWebView}
          />
        ) : (
          <View style={styles.noVideoBox}>
            <Ionicons
              name="alert-circle-outline"
              size={42}
              color={COLORS.textMuted}
            />
            <Text style={styles.noVideoText}>
              This video can&apos;t play inside Hidden Tunes. Try another from
              Hidden Tunes TV.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.infoCard}>
        <View style={styles.youtubePill}>
          <Ionicons name="tv" size={14} color="#000" />
          <Text style={styles.youtubePillText}>Now Playing</Text>
        </View>

        <Text numberOfLines={2} style={styles.title}>
          {title}
        </Text>

        <Text numberOfLines={1} style={styles.artist}>
          {artist}
        </Text>

        <Text style={styles.queueText}>
          {queue.length > 1
            ? `${currentIndex + 1} of ${queue.length} in TV queue`
            : "Now playing"}
        </Text>

        <Text style={styles.statusText}>{playerStatus}</Text>

        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={playPrevious}
            activeOpacity={0.85}
          >
            <Ionicons name="play-skip-back" size={27} color={COLORS.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mainButton}
            onPress={togglePlayPause}
            activeOpacity={0.88}
          >
            <Ionicons
              name={isVideoPlaying ? "pause" : "play"}
              size={34}
              color="#000"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={playNext}
            activeOpacity={0.85}
          >
            <Ionicons
              name="play-skip-forward"
              size={27}
              color={COLORS.text}
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.notice}>
          If playback fails, use Next to jump to another playable Hidden Tunes TV
          video.
        </Text>

        {queue.length <= 1 && (
          <TouchableOpacity
            activeOpacity={0.86}
            style={styles.tvSearchButton}
            onPress={() => router.push("/tv" as any)}
          >
            <Ionicons name="tv" size={17} color="#000" />
            <Text style={styles.tvSearchText}>Find Another TV Video</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.queueList} showsVerticalScrollIndicator={false}>
        <View style={styles.queueHeader}>
          <Text style={styles.queueHeaderTitle}>Up Next</Text>
          <Text style={styles.queueHeaderSub}>Hidden Tunes TV queue</Text>
        </View>

        {queue.map((item, index) => {
          const active = index === currentIndex;

          return (
            <TouchableOpacity
              key={`tv-queue-${item.videoId || item.id}`}
              style={[styles.queueItem, active && styles.queueItemActive]}
              onPress={() => playAtIndex(index)}
              activeOpacity={0.86}
            >
              <View style={styles.queueIndex}>
                {active ? (
                  <Ionicons name="play" size={13} color="#000" />
                ) : (
                  <Text style={styles.queueIndexText}>{index + 1}</Text>
                )}
              </View>

              <View style={styles.queueInfo}>
                <Text numberOfLines={1} style={styles.queueTitle}>
                  {item.title}
                </Text>

                <Text numberOfLines={1} style={styles.queueArtist}>
                  {item.artist || item.channelTitle || "Hidden Tunes TV"}
                </Text>
              </View>

              {active && (
                <Ionicons name="pulse" size={19} color={COLORS.primary} />
              )}
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 120 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 58,
    paddingHorizontal: 18,
  },

  glowPurple: {
    position: "absolute",
    top: 20,
    left: -120,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(168,85,247,0.18)",
  },

  glowCyan: {
    position: "absolute",
    top: 320,
    right: -140,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(34,211,238,0.1)",
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  topTextBox: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 12,
  },

  label: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },

  topTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 3,
  },

  playerFrame: {
    height: 230,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  youtubeWebView: {
    backgroundColor: "#000",
  },

  noVideoBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  noVideoText: {
    color: COLORS.textMuted,
    marginTop: 10,
    fontWeight: "700",
  },

  infoCard: {
    marginTop: 18,
    padding: 18,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  youtubePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },

  youtubePillText: {
    color: "#000",
    fontSize: 11,
    fontWeight: "900",
  },

  title: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
  },

  artist: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 8,
  },

  queueText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 12,
  },

  statusText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
  },

  controls: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },

  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },

  mainButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  notice: {
    color: COLORS.textMuted,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 17,
    marginTop: 16,
  },

  tvSearchButton: {
    alignSelf: "center",
    minHeight: 42,
    borderRadius: 21,
    marginTop: 14,
    paddingHorizontal: 16,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  tvSearchText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "900",
  },

  queueList: {
    marginTop: 18,
  },

  queueHeader: {
    marginBottom: 12,
  },

  queueHeaderTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
  },

  queueHeaderSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },

  queueItem: {
    padding: 14,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  queueItemActive: {
    backgroundColor: "rgba(168,85,247,0.16)",
    borderColor: "rgba(168,85,247,0.4)",
  },

  queueIndex: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  queueIndexText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "900",
  },

  queueInfo: {
    flex: 1,
  },

  queueTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },

  queueArtist: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 5,
    fontWeight: "700",
  },
});
