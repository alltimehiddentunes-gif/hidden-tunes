import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import WebView, { type WebViewMessageEvent } from "react-native-webview";

import TvChannelCard from "@/components/tv/TvChannelCard";
import { COLORS, GRADIENTS } from "@/constants/theme";
import { getTvChannelById } from "@/data/tvChannelSeedCatalog";
import { usePlayerActions } from "@/context/PlayerContext";
import { getMatureTvEnabled } from "@/services/matureTvPreferences";
import { markTvChannelBroken } from "@/services/tv/tvBrokenChannels";
import { getRelatedTvChannels } from "@/services/tv/tvChannelService";
import {
  isTvChannelFavorite,
  toggleTvChannelFavorite,
} from "@/services/tv/tvFavorites";
import {
  getTvPlaybackSession,
  setTvPlaybackSession,
} from "@/services/tv/tvPlaybackSession";
import { recordTvRecentlyWatched } from "@/services/tv/tvRecentlyWatched";
import type { TVChannel, TvLiveSectionId, TvPlaybackContext } from "@/types/tv";
import { closeTvPlayer } from "@/utils/tvNavigation";
import { useMountedRef } from "@/utils/useMountedRef";

function buildHlsPlayerHtml(streamUrl: string, autoplay = true) {
  const autoplayAttr = autoplay ? "autoplay" : "";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #000;
      }
      video {
        width: 100%;
        height: 100%;
        background: #000;
        object-fit: contain;
      }
    </style>
  </head>
  <body>
    <video id="player" playsinline controls ${autoplayAttr}></video>
    <script>
      (function () {
        function post(message) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(String(message));
          }
        }

        var video = document.getElementById("player");
        var streamUrl = ${JSON.stringify(streamUrl)};

        video.addEventListener("playing", function () { post("playing"); });
        video.addEventListener("pause", function () { post("paused"); });
        video.addEventListener("error", function () { post("error"); });

        try {
          video.src = streamUrl;
          if (${autoplay ? "true" : "false"}) {
            var playPromise = video.play();
            if (playPromise && playPromise.catch) {
              playPromise.catch(function () { post("error"); });
            }
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

function formatCategoryLabel(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export default function TvPlayerScreen() {
  const params = useLocalSearchParams();
  const mountedRef = useMountedRef();
  const webViewRef = useRef<WebView>(null);
  const watchedSavedRef = useRef<string | null>(null);
  const sessionRef = useRef<TvPlaybackContext | null>(getTvPlaybackSession());
  const stopRequestedRef = useRef(false);
  const { stopPlayback } = usePlayerActions();

  const initialChannelId = String(params.channelId || "").trim();

  const [activeChannelId, setActiveChannelId] = useState(initialChannelId);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [relatedChannels, setRelatedChannels] = useState<TVChannel[]>([]);
  const [playerKey, setPlayerKey] = useState(0);
  const [playerMounted, setPlayerMounted] = useState(true);

  const channel = useMemo(
    () => (activeChannelId ? getTvChannelById(activeChannelId) : null),
    [activeChannelId]
  );

  const queueIds = sessionRef.current?.channelIds || [];
  const currentIndex = Math.max(0, queueIds.indexOf(activeChannelId));

  const embedHtml = useMemo(() => {
    if (!channel?.streamUrl || channel.streamType === "web") return "";
    return buildHlsPlayerHtml(channel.streamUrl, true);
  }, [channel?.streamUrl, channel?.streamType, playerKey]);

  const refreshFavoriteState = useCallback(async (target: TVChannel) => {
    const favorited = await isTvChannelFavorite(target.id);
    if (mountedRef.current) {
      setIsFavorite(favorited);
    }
  }, [mountedRef]);

  const loadRelated = useCallback(async (target: TVChannel) => {
    const matureEnabled = await getMatureTvEnabled();
    const related = getRelatedTvChannels(target, matureEnabled, 8);
    if (mountedRef.current) {
      setRelatedChannels(related);
    }
  }, [mountedRef]);

  useEffect(() => {
    const session = getTvPlaybackSession();
    if (session) {
      sessionRef.current = session;
    }

    stopPlayback?.();
  }, []);

  const destroyPlayerSurface = useCallback(() => {
    if (stopRequestedRef.current) return;
    stopRequestedRef.current = true;
    setPlayerMounted(false);
    webViewRef.current?.injectJavaScript(
      `try {
        var v = document.getElementById("player");
        if (v) {
          v.pause();
          v.removeAttribute("src");
          v.load();
        }
      } catch (e) {}
      true;`
    );
  }, []);

  const handleExit = useCallback(() => {
    destroyPlayerSurface();
    requestAnimationFrame(() => {
      closeTvPlayer();
    });
  }, [destroyPlayerSurface]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handleExit();
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [handleExit]);

  useEffect(() => {
    if (!channel) return;

    setPlayerMounted(true);
    stopRequestedRef.current = false;
    setIsLoading(true);
    setHasError(false);
    setIsPlaying(true);
    setPlayerKey((value) => value + 1);

    void refreshFavoriteState(channel);
    void loadRelated(channel);

    if (watchedSavedRef.current !== channel.id) {
      watchedSavedRef.current = channel.id;
      void recordTvRecentlyWatched(channel);
    }
  }, [channel, loadRelated, refreshFavoriteState]);

  const switchToChannel = useCallback(
    (
      nextChannel: TVChannel,
      options: { sectionId?: TvLiveSectionId; channelIds?: string[] } = {}
    ) => {
      const ids =
        options.channelIds && options.channelIds.length
          ? options.channelIds
          : sessionRef.current?.channelIds || [nextChannel.id];
      const sectionId =
        options.sectionId || sessionRef.current?.sectionId || "related";
      const startIndex = Math.max(0, ids.indexOf(nextChannel.id));
      const nextSession: TvPlaybackContext = {
        sectionId,
        channelIds: ids,
        startIndex,
      };

      sessionRef.current = nextSession;
      setTvPlaybackSession(nextSession);
      watchedSavedRef.current = null;
      setActiveChannelId(nextChannel.id);
    },
    []
  );

  const goToQueueIndex = useCallback(
    (nextIndex: number) => {
      const ids = sessionRef.current?.channelIds || [];
      if (!ids.length) return;

      const bounded =
        ((nextIndex % ids.length) + ids.length) % ids.length;
      const nextId = ids[bounded];
      if (!nextId || nextId === activeChannelId) return;

      const nextChannel = getTvChannelById(nextId);
      if (!nextChannel) return;

      switchToChannel(nextChannel);
    },
    [activeChannelId, switchToChannel]
  );

  const handlePrevious = useCallback(() => {
    goToQueueIndex(currentIndex - 1);
  }, [currentIndex, goToQueueIndex]);

  const handleNext = useCallback(() => {
    goToQueueIndex(currentIndex + 1);
  }, [currentIndex, goToQueueIndex]);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    setIsPlaying(true);
    setPlayerKey((value) => value + 1);
  }, []);

  const handleToggleFavorite = useCallback(async () => {
    if (!channel) return;
    const result = await toggleTvChannelFavorite(channel);
    if (mountedRef.current) {
      setIsFavorite(result.favorited);
    }
  }, [channel, mountedRef]);

  const handleReportBroken = useCallback(() => {
    if (!channel) return;
    markTvChannelBroken(channel.id);
    setHasError(true);
    setIsLoading(false);
  }, [channel]);

  const handleWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    const message = String(event.nativeEvent.data || "");

    if (message === "playing") {
      setIsLoading(false);
      setHasError(false);
      setIsPlaying(true);
      return;
    }

    if (message === "paused") {
      setIsPlaying(false);
      return;
    }

    if (message === "error" || message === "timeout") {
      setIsLoading(false);
      setHasError(true);
      setIsPlaying(false);
    }
  }, []);

  const handleTogglePlayback = useCallback(() => {
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);
    webViewRef.current?.injectJavaScript(
      `window.togglePlayback && window.togglePlayback(${nextPlaying ? "true" : "false"}); true;`
    );
  }, [isPlaying]);

  const openRelatedChannel = useCallback(
    (related: TVChannel) => {
      switchToChannel(related, {
        sectionId: "related",
        channelIds: relatedChannels.map((entry) => entry.id),
      });
    },
    [relatedChannels, switchToChannel]
  );

  if (!channel) {
    return (
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <View style={styles.fallbackBox}>
          <Text style={styles.fallbackTitle}>Channel unavailable</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleExit}>
            <Text style={styles.primaryButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={handleExit}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>

        <Text style={styles.topTitle} numberOfLines={1}>
          {channel.name}
        </Text>

        <TouchableOpacity style={styles.iconButton} onPress={handleToggleFavorite}>
          <Ionicons
            name={isFavorite ? "heart" : "heart-outline"}
            size={20}
            color={isFavorite ? COLORS.primary : COLORS.text}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.playerShell}>
        {hasError ? (
          <View style={styles.errorOverlay}>
            <Ionicons name="alert-circle-outline" size={42} color={COLORS.textMuted} />
            <Text style={styles.errorTitle}>Channel unavailable right now</Text>
            <Text style={styles.errorSub}>
              This stream could not be loaded. Try again or skip to another channel.
            </Text>

            <View style={styles.errorActions}>
              <TouchableOpacity style={styles.primaryButton} onPress={handleRetry}>
                <Text style={styles.primaryButtonText}>Try again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleNext}>
                <Text style={styles.secondaryButtonText}>Next channel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : embedHtml && playerMounted ? (
          <WebView
            key={`tv-player-${playerKey}`}
            ref={webViewRef}
            source={{ html: embedHtml }}
            style={styles.webView}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            onMessage={handleWebViewMessage}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
            onHttpError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        ) : !embedHtml ? (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorTitle}>Stream format not supported</Text>
          </View>
        ) : null}

        {isLoading && !hasError ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            <Text style={styles.loadingText}>Loading stream...</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.controlsRow}>
        <TouchableOpacity style={styles.controlButton} onPress={handlePrevious}>
          <Ionicons name="play-skip-back" size={22} color={COLORS.text} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.playButton} onPress={handleTogglePlayback}>
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={24}
            color="#000"
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.controlButton} onPress={handleNext}>
          <Ionicons name="play-skip-forward" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.metaScroll}
        contentContainerStyle={styles.metaContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.channelMeta}>
          {channel.logoUrl ? (
            <Image
              source={{ uri: channel.logoUrl }}
              style={styles.channelLogo}
              contentFit="contain"
            />
          ) : (
            <View style={styles.channelLogoFallback}>
              <Ionicons name="tv" size={24} color={COLORS.primary} />
            </View>
          )}

          <View style={styles.channelCopy}>
            <Text style={styles.channelName}>{channel.name}</Text>
            <Text style={styles.channelDetails}>
              {formatCategoryLabel(channel.category)}
              {channel.country ? ` · ${channel.country}` : ""}
              {channel.language ? ` · ${channel.language}` : ""}
            </Text>
            {channel.description ? (
              <Text style={styles.channelDescription}>{channel.description}</Text>
            ) : null}
          </View>
        </View>

        <TouchableOpacity style={styles.reportButton} onPress={handleReportBroken}>
          <Ionicons name="flag-outline" size={16} color={COLORS.textMuted} />
          <Text style={styles.reportText}>Report broken channel</Text>
        </TouchableOpacity>

        {relatedChannels.length ? (
          <View style={styles.relatedSection}>
            <Text style={styles.relatedTitle}>Related Channels</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {relatedChannels.map((related) => (
                <TvChannelCard
                  key={related.id}
                  channel={related}
                  onPress={openRelatedChannel}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 52,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 10,
  },

  topTitle: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },

  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  playerShell: {
    marginHorizontal: 16,
    aspectRatio: 16 / 9,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  webView: {
    flex: 1,
    backgroundColor: "#000",
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  loadingText: {
    color: COLORS.textMuted,
    marginTop: 10,
    fontSize: 12,
    fontWeight: "800",
  },

  errorOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    backgroundColor: "rgba(0,0,0,0.82)",
  },

  errorTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 12,
    textAlign: "center",
  },

  errorSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },

  errorActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },

  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    paddingVertical: 14,
  },

  controlButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  playButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },

  metaScroll: {
    flex: 1,
  },

  metaContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  channelMeta: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },

  channelLogo: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  channelLogoFallback: {
    width: 64,
    height: 64,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  channelCopy: {
    flex: 1,
  },

  channelName: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
  },

  channelDetails: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },

  channelDescription: {
    color: COLORS.textDim,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 8,
  },

  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingVertical: 8,
  },

  reportText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },

  relatedSection: {
    marginTop: 10,
  },

  relatedTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
  },

  fallbackBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  fallbackTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 16,
  },

  primaryButton: {
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 16,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "900",
  },

  secondaryButton: {
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
});
