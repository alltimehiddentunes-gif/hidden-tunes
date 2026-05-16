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
import WebView from "react-native-webview";
import YoutubePlayer, {
  PLAYER_STATES,
  type YoutubeIframeRef,
} from "react-native-youtube-iframe";

import { COLORS, GRADIENTS } from "../constants/theme";
import { usePlayer } from "../context/PlayerContext";

type YouTubeQueueItem = {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  channelTitle: string;
  thumbnail: string;
};

const YOUTUBE_MINI_KEY = "hidden_tunes_current_youtube";
const BLOCKED_EXTERNAL_SCHEMES = [
  "youtube://",
  "vnd.youtube:",
  "intent://",
  "market://",
  "itms-apps://",
];

function sanitizeYouTubeVideoId(value: any) {
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
    clean.includes("ytimg.com")
  );
}

function normalizeQueueItem(item: any): YouTubeQueueItem | null {
  const videoId = sanitizeYouTubeVideoId(item?.videoId || item?.id);

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
  const youtubeRef = useRef<YoutubeIframeRef | null>(null);

  const { stopPlayback } = usePlayer() as any;

  const startedAtRef = useRef<number>(Date.now());
  const autoNextLockRef = useRef(false);
  const errorSkipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialVideoId = sanitizeYouTubeVideoId(params.videoId || params.id);
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
    } catch (error) {
      console.log("Hidden Tunes TV queue parse error:", error);
    }

    const fallbackItem = normalizeQueueItem({
      id: initialVideoId,
      videoId: initialVideoId,
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
  const [playerStatus, setPlayerStatus] = useState(
    "Loading Hidden Tunes TV player..."
  );
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const [directEmbedMode, setDirectEmbedMode] = useState(false);

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

  useEffect(() => {
    stopPlayback?.();

    return () => {
      if (errorSkipTimerRef.current) {
        clearTimeout(errorSkipTimerRef.current);
      }

      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    saveYouTubeMini();

    startedAtRef.current = Date.now();
    autoNextLockRef.current = false;
    setIsVideoPlaying(true);
    setPlayerReady(false);
    setDirectEmbedMode(false);
    setPlayerStatus("Loading Hidden Tunes TV player...");

    if (errorSkipTimerRef.current) {
      clearTimeout(errorSkipTimerRef.current);
      errorSkipTimerRef.current = null;
    }

    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
    }

    fallbackTimerRef.current = setTimeout(() => {
      setDirectEmbedMode(true);
      setPlayerReady(true);
      setPlayerStatus("Retrying inside Hidden Tunes TV. Tap the video to play.");
    }, 7000);
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
    } catch (error) {
      console.log("Save YouTube mini error:", error);
    }
  }

  function playAtIndex(index: number) {
    if (!queue.length) return;

    const safeIndex = Math.max(0, Math.min(index, queue.length - 1));

    startedAtRef.current = Date.now();
    autoNextLockRef.current = false;
    setIsVideoPlaying(true);
    setPlayerReady(false);
    setDirectEmbedMode(false);
    setPlayerStatus("Loading Hidden Tunes TV player...");
    setCurrentIndex(safeIndex);
  }

  function playNext() {
    if (queue.length <= 1) {
      setPlayerStatus("No TV queue yet. Open Hidden Tunes TV to choose another video.");
      return;
    }

    const next = currentIndex + 1;
    playAtIndex(next >= queue.length ? 0 : next);
  }

  function playPrevious() {
    if (queue.length <= 1) {
      setPlayerStatus("No previous video in this TV queue.");
      return;
    }

    const previous = currentIndex - 1;
    playAtIndex(previous < 0 ? queue.length - 1 : previous);
  }

  function togglePlayPause() {
    if (directEmbedMode) {
      setPlayerStatus("Use the in-app video controls.");
      return;
    }

    if (!playerReady) {
      setPlayerStatus("Player is still loading. Try again in a moment.");
      return;
    }

    setIsVideoPlaying((playing) => {
      const next = !playing;
      setPlayerStatus(next ? "Playing" : "Paused");
      return next;
    });
  }

  function safeAutoNext(reason: string, allowEarlySkip = false) {
    const watchedMs = Date.now() - startedAtRef.current;
    const watchedSeconds = Math.floor(watchedMs / 1000);

    console.log("YouTube iframe auto-next check:", {
      reason,
      watchedSeconds,
      allowEarlySkip,
    });

    if (autoNextLockRef.current) return;

    if (!allowEarlySkip && watchedMs < 3000) {
      console.log("Blocked early YouTube auto-next:", reason);
      setPlayerStatus("Waiting for stable playback before auto-next...");
      return;
    }

    if (queue.length <= 1) {
      setIsVideoPlaying(false);
      setPlayerStatus("Video ended.");
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

  function handlePlayerStateChange(state: PLAYER_STATES) {
    if (state === PLAYER_STATES.PLAYING) {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }

      setIsVideoPlaying(true);
      setPlayerReady(true);
      setPlayerStatus("Playing");
      return;
    }

    if (state === PLAYER_STATES.PAUSED) {
      setIsVideoPlaying(false);
      setPlayerStatus("Paused");
      return;
    }

    if (state === PLAYER_STATES.BUFFERING) {
      setPlayerStatus("Buffering...");
      return;
    }

    if (state === PLAYER_STATES.ENDED) {
      setIsVideoPlaying(false);
      safeAutoNext("youtube-ended");
      return;
    }

    if (state === PLAYER_STATES.VIDEO_CUED) {
      setPlayerReady(true);
      setPlayerStatus("Ready. Tap play if the video does not start.");
    }
  }

  function handlePlayerError(error: string) {
    console.log("Hidden Tunes TV iframe error:", {
      videoId,
      error,
    });

    setIsVideoPlaying(false);
    setDirectEmbedMode(false);
    setPlayerReady(true);
    setPlayerStatus("This video cannot play inside Hidden Tunes TV. Try another result.");
  }

  const directEmbedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&controls=1&rel=0&fs=1`;

  function handleInAppWebViewNavigation(request: { url: string }) {
    const requestUrl = String(request.url || "");

    if (!requestUrl) return true;
    if (isBlockedExternalUrl(requestUrl)) {
      setPlayerStatus("Hidden Tunes TV blocked an external app handoff.");
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
          title: "Hidden Tunes TV",
          artist: "Hidden Tunes TV",
          channelTitle: "Hidden Tunes TV",
          thumbnail: `https://img.youtube.com/vi/${linkedVideoId}/hqdefault.jpg`,
        },
      } as any);
      return false;
    }

    if (!isAllowedEmbedUrl(requestUrl)) {
      setPlayerStatus("Hidden Tunes TV kept playback inside the app.");
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
        {videoId && directEmbedMode ? (
          <WebView
            key={`direct-${videoId}`}
            source={{ uri: directEmbedUrl }}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            allowsProtectedMedia
            mediaPlaybackRequiresUserAction={false}
            setSupportMultipleWindows={false}
            mixedContentMode="always"
            originWhitelist={["*"]}
            onLoadEnd={() => {
              setPlayerReady(true);
              setPlayerStatus("In-app TV player ready. Tap video if needed.");
            }}
            onError={(event) => {
              console.log("Hidden Tunes TV embed WebView error:", event.nativeEvent);
              setPlayerStatus(
                "This video cannot play inside Hidden Tunes TV. Try another result."
              );
            }}
            onHttpError={(event) => {
              console.log("Hidden Tunes TV embed HTTP error:", event.nativeEvent);
              setPlayerStatus(
                "This video cannot play inside Hidden Tunes TV. Try another result."
              );
            }}
            onShouldStartLoadWithRequest={handleInAppWebViewNavigation}
            style={styles.youtubeWebView}
          />
        ) : videoId ? (
          <YoutubePlayer
            ref={youtubeRef}
            key={videoId}
            height={230}
            videoId={videoId}
            play={isVideoPlaying}
            baseUrlOverride="https://www.youtube.com"
            forceAndroidAutoplay
            useLocalHTML
            initialPlayerParams={{
              controls: true,
              rel: false,
              preventFullScreen: false,
              iv_load_policy: 3,
            }}
            webViewStyle={styles.youtubeWebView}
            webViewProps={{
              allowsInlineMediaPlayback: true,
              allowsFullscreenVideo: true,
              allowsProtectedMedia: true,
              javaScriptEnabled: true,
              domStorageEnabled: true,
              mediaPlaybackRequiresUserAction: false,
              setSupportMultipleWindows: false,
              mixedContentMode: "always",
              onShouldStartLoadWithRequest: handleInAppWebViewNavigation,
            }}
            onReady={() => {
              if (fallbackTimerRef.current) {
                clearTimeout(fallbackTimerRef.current);
                fallbackTimerRef.current = null;
              }

              setPlayerReady(true);
              setPlayerStatus("Ready. Tap play if the video does not start.");
            }}
            onChangeState={handlePlayerStateChange}
            onError={handlePlayerError}
          />
        ) : (
          <View style={styles.noVideoBox}>
            <Ionicons
              name="alert-circle-outline"
              size={42}
              color={COLORS.textMuted}
            />
            <Text style={styles.noVideoText}>No valid YouTube video ID.</Text>
          </View>
        )}
      </View>

      <View style={styles.infoCard}>
        <View style={styles.youtubePill}>
          <Ionicons name="tv" size={14} color="#000" />
          <Text style={styles.youtubePillText}>Hidden Tunes TV Player</Text>
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
            : "Single TV play"}
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
          Hidden Tunes TV uses official embedded playback inside the app. Some
          videos may still block embeds.
        </Text>

        {!directEmbedMode && (
          <TouchableOpacity
            activeOpacity={0.86}
            style={styles.secondaryButton}
            onPress={() => {
              setDirectEmbedMode(true);
              setPlayerReady(true);
              setPlayerStatus("Retrying inside Hidden Tunes TV. Tap the video to play.");
            }}
          >
            <Ionicons name="refresh" size={16} color={COLORS.text} />
            <Text style={styles.secondaryButtonText}>Retry inside Hidden Tunes</Text>
          </TouchableOpacity>
        )}

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
          <Text style={styles.queueHeaderSub}>
            Hidden Tunes TV queue
          </Text>
        </View>

        {queue.map((item, index) => {
          const active = index === currentIndex;

          return (
            <TouchableOpacity
              key={`${item.videoId || item.id}-${index}`}
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

  secondaryButton: {
    alignSelf: "center",
    minHeight: 40,
    borderRadius: 20,
    marginTop: 12,
    paddingHorizontal: 15,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  secondaryButtonText: {
    color: COLORS.text,
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
