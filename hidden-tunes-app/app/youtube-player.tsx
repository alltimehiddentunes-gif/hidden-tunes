import { useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import WebView from "react-native-webview";

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

const YOUTUBE_ORIGIN = "https://hiddentunes.com";
const YOUTUBE_MINI_KEY = "hidden_tunes_current_youtube";

function sanitizeYouTubeVideoId(value: any) {
  const text = String(value || "").replace("youtube-", "").trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;

  const match = text.match(/[a-zA-Z0-9_-]{11}/);
  return match ? match[0] : "";
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
  const webViewRef = useRef<WebView | null>(null);

  const { stopPlayback } = usePlayer() as any;

  const startedAtRef = useRef<number>(Date.now());
  const autoNextLockRef = useRef(false);
  const errorSkipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialVideoId = sanitizeYouTubeVideoId(params.videoId || params.id);
  const initialTitle = String(params.title || "YouTube Music");
  const initialArtist = String(
    params.artist || params.channelTitle || "YouTube"
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
      console.log("YouTube queue parse error:", error);
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
  const [playerStatus, setPlayerStatus] = useState("Loading YouTube player...");
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

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
    };
  }, []);

  useEffect(() => {
    saveYouTubeMini();

    startedAtRef.current = Date.now();
    autoNextLockRef.current = false;
    setIsVideoPlaying(false);
    setPlayerStatus("Loading YouTube player...");

    if (errorSkipTimerRef.current) {
      clearTimeout(errorSkipTimerRef.current);
      errorSkipTimerRef.current = null;
    }
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

  function runPlayerCommand(command: "play" | "pause" | "mute" | "unmute") {
    const js = `
      try {
        if (window.player && "${command}" === "play" && typeof window.player.playVideo === "function") {
          window.player.playVideo();
        }

        if (window.player && "${command}" === "pause" && typeof window.player.pauseVideo === "function") {
          window.player.pauseVideo();
        }

        if (window.player && "${command}" === "mute" && typeof window.player.mute === "function") {
          window.player.mute();
        }

        if (window.player && "${command}" === "unmute" && typeof window.player.unMute === "function") {
          window.player.unMute();
        }
      } catch (error) {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "command_error",
          command: "${command}",
          message: String(error)
        }));
      }
      true;
    `;

    webViewRef.current?.injectJavaScript(js);
  }

  function playAtIndex(index: number) {
    if (!queue.length) return;

    const safeIndex = Math.max(0, Math.min(index, queue.length - 1));

    startedAtRef.current = Date.now();
    autoNextLockRef.current = false;
    setIsVideoPlaying(false);
    setPlayerStatus("Loading YouTube player...");
    setCurrentIndex(safeIndex);
  }

  function playNext() {
    if (queue.length <= 1) return;

    const next = currentIndex + 1;
    playAtIndex(next >= queue.length ? 0 : next);
  }

  function playPrevious() {
    if (queue.length <= 1) return;

    const previous = currentIndex - 1;
    playAtIndex(previous < 0 ? queue.length - 1 : previous);
  }

  function togglePlayPause() {
    if (isVideoPlaying) {
      runPlayerCommand("pause");
      setIsVideoPlaying(false);
      setPlayerStatus("Paused");
    } else {
      runPlayerCommand("play");
      setIsVideoPlaying(true);
      setPlayerStatus("Playing");
    }
  }

  function safeAutoNext(reason: string, allowEarlySkip = false) {
    const watchedMs = Date.now() - startedAtRef.current;
    const watchedSeconds = Math.floor(watchedMs / 1000);

    console.log("YouTube WebView auto-next check:", {
      reason,
      watchedSeconds,
      allowEarlySkip,
    });

    if (autoNextLockRef.current) return;

    if (!allowEarlySkip && watchedMs < 3000) {
      console.log("Blocked early WebView auto-next:", reason);
      setPlayerStatus("Waiting for stable playback before auto-next...");
      return;
    }

    if (queue.length <= 1) {
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

  function scheduleErrorSkip() {
    if (queue.length <= 1) return;

    if (errorSkipTimerRef.current) {
      clearTimeout(errorSkipTimerRef.current);
    }

    setPlayerStatus("This video cannot be embedded. Skipping...");

    errorSkipTimerRef.current = setTimeout(() => {
      safeAutoNext("youtube-error", true);
    }, 1800);
  }

  function handleWebViewMessage(event: any) {
    const rawMessage = String(event.nativeEvent.data || "");

    try {
      const message = JSON.parse(rawMessage);

      if (message.type === "ready") {
        setPlayerStatus("Ready");
        return;
      }

      if (message.type === "playing") {
        setIsVideoPlaying(true);
        setPlayerStatus("Playing");
        return;
      }

      if (message.type === "paused") {
        setIsVideoPlaying(false);
        setPlayerStatus("Paused");
        return;
      }

      if (message.type === "ended") {
        setIsVideoPlaying(false);
        safeAutoNext("youtube-ended");
        return;
      }

      if (message.type === "error") {
        console.log("YouTube iframe error:", message);
        setIsVideoPlaying(false);
        scheduleErrorSkip();
        return;
      }

      if (message.type === "command_error") {
        console.log("YouTube command error:", message);
      }
    } catch {
      console.log("YouTube raw message:", rawMessage);
    }
  }

  const embedHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0"
        />

        <style>
          html, body {
            margin: 0;
            padding: 0;
            background: #000;
            width: 100%;
            height: 100%;
            overflow: hidden;
          }

          #player {
            width: 100vw;
            height: 100vh;
          }
        </style>
      </head>

      <body>
        <div id="player"></div>

        <script>
          var tag = document.createElement("script");
          tag.src = "https://www.youtube.com/iframe_api";
          var firstScriptTag = document.getElementsByTagName("script")[0];
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

          window.player = null;
          var hasPlayed = false;

          function sendMessage(payload) {
            try {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify(payload));
              }
            } catch (error) {}
          }

          function onYouTubeIframeAPIReady() {
            window.player = new YT.Player("player", {
              width: "100%",
              height: "100%",
              videoId: "${videoId}",
              host: "https://www.youtube.com",
              playerVars: {
                autoplay: 1,
                controls: 1,
                playsinline: 1,
                rel: 0,
                modestbranding: 1,
                origin: "${YOUTUBE_ORIGIN}",
                enablejsapi: 1
              },
              events: {
                onReady: function(event) {
                  sendMessage({ type: "ready" });
                  try {
                    event.target.playVideo();
                  } catch (error) {}
                },
                onStateChange: function(event) {
                  if (event.data === YT.PlayerState.PLAYING) {
                    hasPlayed = true;
                    sendMessage({ type: "playing" });
                  }

                  if (event.data === YT.PlayerState.PAUSED) {
                    sendMessage({ type: "paused" });
                  }

                  if (event.data === YT.PlayerState.ENDED) {
                    if (hasPlayed) {
                      sendMessage({ type: "ended" });
                    }
                  }
                },
                onError: function(event) {
                  sendMessage({
                    type: "error",
                    code: event.data
                  });
                }
              }
            });
          }
        </script>
      </body>
    </html>
  `;

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
          <Text style={styles.label}>YOUTUBE WEBVIEW</Text>
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
        {videoId ? (
          <WebView
            ref={webViewRef}
            key={videoId}
            originWhitelist={["*"]}
            source={{
              html: embedHtml,
              baseUrl: YOUTUBE_ORIGIN,
              headers: {
                Referer: `${YOUTUBE_ORIGIN}/`,
              },
            }}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo
            setSupportMultipleWindows={false}
            mixedContentMode="always"
            onMessage={handleWebViewMessage}
            onError={(error) => {
              console.log("YouTube WebView error:", error.nativeEvent);
              setPlayerStatus("WebView error. Tap next.");
              scheduleErrorSkip();
            }}
            onHttpError={(error) => {
              console.log("YouTube WebView HTTP error:", error.nativeEvent);
              setPlayerStatus("YouTube HTTP error. Tap next.");
              scheduleErrorSkip();
            }}
            style={styles.webview}
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
          <Ionicons name="logo-youtube" size={14} color="#fff" />
          <Text style={styles.youtubePillText}>Autoplay TV Queue</Text>
        </View>

        <Text numberOfLines={2} style={styles.title}>
          {title}
        </Text>

        <Text numberOfLines={1} style={styles.artist}>
          {artist}
        </Text>

        <Text style={styles.queueText}>
          {queue.length > 1
            ? `${currentIndex + 1} of ${queue.length} in YouTube queue`
            : "Single YouTube play"}
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
          TV videos autoplay through your Hidden Tunes queue. Native audio stays
          reserved for R2, Audius and Archive.
        </Text>
      </View>

      <ScrollView style={styles.queueList} showsVerticalScrollIndicator={false}>
        <View style={styles.queueHeader}>
          <Text style={styles.queueHeaderTitle}>Up Next</Text>
          <Text style={styles.queueHeaderSub}>
            Hidden Tunes channel autoplay queue
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
                  {item.artist || item.channelTitle || "YouTube"}
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

  webview: {
    flex: 1,
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
    backgroundColor: "#ff0033",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },

  youtubePillText: {
    color: "#fff",
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