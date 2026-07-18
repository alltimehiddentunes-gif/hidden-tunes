import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router/react-navigation";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native";
import WebView from "react-native-webview";

import { COLORS, GRADIENTS } from "../constants/theme";
import { replaceTvPlayerRoute } from "@/services/tvDiscoveryOpen";
import {
  confirmTvSessionActiveStation,
  getTvDiscoverySession,
  markTvSessionStationFailed,
  releaseTvSessionPendingCandidate,
} from "@/services/tvDiscoverySessionStore";
import {
  getTvChannelInitials,
  markTvArtworkLoadFailure,
} from "@/utils/tvArtwork";
import {
  TV_NAV_EXHAUSTED,
  TV_NAV_STALE,
} from "@/utils/tvPlayabilityGate";
import {
  exploreForwardUntilPlayable,
  tvDiscoveryNextStation,
  tvDiscoveryPreviousStation,
} from "@/utils/tvDiscoveryNavigation";
import { buildTvStreamPlayerHtml } from "@/utils/tvPlayerHtml";
import {
  pauseTvWebViewPlayback,
  releaseTvPlayerRuntime,
  resumeTvWebViewPlayback,
  stopTvWebViewPlayback,
} from "@/utils/tvPlayerLifecycle";
import type { TvStationPlayResult } from "@/types/tvDiscovery";
import { recordTvPlaybackFailure } from "@/utils/tvPlaybackFailureStore";

function readRouteParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

type TvDisplayStation = {
  stationId: string;
  title: string;
  streamUrl: string;
  sourceType: string;
  artwork: string;
  category: string;
  country: string;
  contextLine: string;
  resolutionSequence: string;
};

type PlayerPhase = "idle" | "loading" | "exhausted";

function logTvNext(event: string, details: Record<string, unknown> = {}) {
  if (!__DEV__) return;
  console.log(`[tv_next] ${event}`, details);
}

function isPreResolvedInitialStation(station: TvDisplayStation) {
  const session = getTvDiscoverySession();
  if (!session?.pendingCandidateStation) return false;

  return (
    session.pendingCandidateStation.stationId === station.stationId &&
    session.pendingStreamUrl.trim() === station.streamUrl.trim()
  );
}

function resultToCandidate(
  result: Extract<TvStationPlayResult, { ok: true }>,
  contextTitle: string,
  hierarchyLabel: string
): TvDisplayStation {
  return {
    stationId: result.station.stationId,
    title: result.station.stationName,
    streamUrl: result.streamUrl,
    sourceType: result.sourceType,
    artwork: result.station.artwork,
    category: result.station.category,
    country: result.station.country,
    contextLine: hierarchyLabel || contextTitle || "Hidden Tunes TV",
    resolutionSequence: String(result.resolutionSequence),
  };
}

type TvStreamPlayerProps = {
  stationId: string;
  streamUrl: string;
  webViewRef: React.RefObject<WebView | null>;
  onPlaybackReady: () => void;
  onPlaybackFailed: (reason: string) => void;
  onPlayingStateChange?: (playing: boolean) => void;
};

const TvStreamPlayer = memo(function TvStreamPlayer({
  stationId,
  streamUrl,
  webViewRef,
  onPlaybackReady,
  onPlaybackFailed,
  onPlayingStateChange,
}: TvStreamPlayerProps) {
  const html = useMemo(
    () => (streamUrl ? buildTvStreamPlayerHtml(streamUrl) : ""),
    [streamUrl]
  );
  const webViewSource = useMemo(
    () => ({ html, baseUrl: "https://hiddentunes.com" as const }),
    [html]
  );

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          reason?: string;
          playing?: boolean;
        };
        if (payload.type === "tv_ready") {
          onPlaybackReady();
          return;
        }
        if (payload.type === "tv_playing") {
          onPlayingStateChange?.(Boolean(payload.playing));
          return;
        }
        if (payload.type === "tv_error") {
          onPlaybackFailed(String(payload.reason || "playback_error"));
        }
      } catch {
        onPlaybackFailed("invalid_player_message");
      }
    },
    [onPlaybackFailed, onPlaybackReady, onPlayingStateChange]
  );

  if (!streamUrl) return null;

  return (
    <WebView
      ref={webViewRef}
      key={`tv-stream-${stationId}-${streamUrl}`}
      allowsInlineMediaPlayback
      allowsPictureInPictureMediaPlayback
      allowsFullscreenVideo
      cacheEnabled={false}
      incognito
      javaScriptEnabled
      mediaPlaybackRequiresUserAction={false}
      onMessage={handleMessage}
      originWhitelist={["*"]}
      source={webViewSource}
      style={styles.webView}
    />
  );
});

type TvStationDetailsProps = {
  title: string;
  artwork: string;
  category: string;
  country: string;
  contextLine: string;
  positionLabel: string;
  sourceType: string;
  artworkFailed: boolean;
  onArtworkError: () => void;
};

const TvStationDetails = memo(function TvStationDetails({
  title,
  artwork,
  category,
  country,
  contextLine,
  positionLabel,
  sourceType,
  artworkFailed,
  onArtworkError,
}: TvStationDetailsProps) {
  const showArtwork = Boolean(artwork) && !artworkFailed;
  const initials = useMemo(() => getTvChannelInitials(title), [title]);
  const metaLine = [category, country].filter(Boolean).join(" · ");

  return (
    <View style={styles.stationRow}>
      {showArtwork ? (
        <Image
          source={{ uri: artwork }}
          style={styles.artwork}
          contentFit="cover"
          cachePolicy="memory-disk"
          onError={onArtworkError}
        />
      ) : (
        <View style={styles.artworkFallback}>
          <Text style={styles.artworkInitials}>{initials}</Text>
        </View>
      )}

      <View style={styles.stationCopy}>
        <View style={styles.badge}>
          <Ionicons name="tv" size={14} color={COLORS.backgroundDeep} />
          <Text style={styles.badgeText}>Now Playing</Text>
        </View>
        <Text numberOfLines={2} style={styles.nowPlayingTitle}>
          {title}
        </Text>
        {metaLine ? (
          <Text numberOfLines={1} style={styles.metaLine}>
            {metaLine}
          </Text>
        ) : null}
        <Text numberOfLines={1} style={styles.contextLine}>
          {contextLine}
        </Text>
        {positionLabel ? <Text style={styles.positionLine}>{positionLabel}</Text> : null}
        <Text style={styles.sourceType}>{sourceType.replace(/_/g, " ")}</Text>
      </View>
    </View>
  );
});

export default function TvPlayerScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    title?: string;
    streamUrl?: string;
    sourceType?: string;
    contextTitle?: string;
    hierarchyLabel?: string;
    country?: string;
    category?: string;
    artwork?: string;
    browseReturnPath?: string;
    resolutionSequence?: string;
  }>();

  const displayWebViewRef = useRef<WebView>(null);
  const stagingWebViewRef = useRef<WebView>(null);
  const navRequestRef = useRef(0);
  const candidateRef = useRef<TvDisplayStation | null>(null);
  const confirmedRef = useRef<TvDisplayStation | null>(null);
  const recoveryLoopRef = useRef(false);
  const bootstrappedRef = useRef(false);
  const isStreamPlayingRef = useRef(true);
  const wasPlayingBeforeBackgroundRef = useRef(true);

  const [confirmed, setConfirmed] = useState<TvDisplayStation | null>(null);
  const [candidate, setCandidate] = useState<TvDisplayStation | null>(null);
  const [phase, setPhase] = useState<PlayerPhase>("loading");
  const [artworkFailed, setArtworkFailed] = useState(false);
  const [streamMounted, setStreamMounted] = useState(true);
  const [isStreamPlaying, setIsStreamPlaying] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const [positionLabel, setPositionLabel] = useState("");

  const browseReturnPath = readRouteParam(params.browseReturnPath).trim() || "/youtube-feed";
  const routeContextTitle = readRouteParam(params.contextTitle).trim();
  const routeHierarchyLabel = readRouteParam(params.hierarchyLabel).trim();

  const syncPositionLabel = useCallback(() => {
    const session = getTvDiscoverySession();
    if (!session?.confirmedActiveStation) {
      setPositionLabel("");
      return;
    }
    setPositionLabel(`${session.currentIndex + 1} of ${session.items.length}`);
  }, []);

  const stopDisplayStream = useCallback(() => {
    stopTvWebViewPlayback(displayWebViewRef);
  }, []);

  const stopStagingStream = useCallback(() => {
    stopTvWebViewPlayback(stagingWebViewRef);
  }, []);

  const stopAllStreams = useCallback(() => {
    stopDisplayStream();
    stopStagingStream();
    setStreamMounted(false);
  }, [stopDisplayStream, stopStagingStream]);

  const exitTvPlayer = useCallback(() => {
    stopAllStreams();
    releaseTvPlayerRuntime({ webViewRef: displayWebViewRef, clearSession: true });
    releaseTvPlayerRuntime({ webViewRef: stagingWebViewRef, clearSession: false });
  }, [stopAllStreams]);

  const promoteCandidate = useCallback(() => {
    const pending = candidateRef.current;
    if (!pending) return;

    confirmTvSessionActiveStation();
    confirmedRef.current = pending;
    candidateRef.current = null;
    setConfirmed(pending);
    setCandidate(null);
    setPhase("idle");
    setArtworkFailed(false);
    setIsStreamPlaying(true);
    syncPositionLabel();
    logTvNext("tv_next_playback_confirmed", {
      stationId: pending.stationId,
      generation: pending.resolutionSequence,
    });
    logTvNext("tv_next_promoted", {
      stationId: pending.stationId,
      generation: pending.resolutionSequence,
    });

    const session = getTvDiscoverySession();
    if (session?.confirmedActiveStation) {
      replaceTvPlayerRoute({
        ok: true,
        station: session.confirmedActiveStation,
        streamUrl: pending.streamUrl,
        sourceType: pending.sourceType,
        resolutionSequence: Number(pending.resolutionSequence) || 0,
        candidateIndex: session.currentIndex,
        pendingOnly: true,
      });
    }
  }, [syncPositionLabel]);

  const beginCandidate = useCallback((next: TvDisplayStation) => {
    candidateRef.current = next;
    setCandidate(next);
    setPhase("loading");
    setStreamMounted(true);
  }, []);

  const confirmResolvedInitialStation = useCallback(
    (station: TvDisplayStation) => {
      confirmTvSessionActiveStation();
      confirmedRef.current = station;
      candidateRef.current = null;
      setConfirmed(station);
      setCandidate(null);
      setPhase("idle");
      setArtworkFailed(false);
      setIsStreamPlaying(true);
      setStreamMounted(true);
      syncPositionLabel();
    },
    [syncPositionLabel]
  );

  const applyPlayResult = useCallback(
    (result: TvStationPlayResult) => {
      if (!result.ok) return false;
      beginCandidate(
        resultToCandidate(result, routeContextTitle, routeHierarchyLabel)
      );
      return true;
    },
    [beginCandidate, routeContextTitle, routeHierarchyLabel]
  );

  const runRecoveryLoop = useCallback(
    async (requestId: number, direction: "next" | "previous" = "next") => {
      if (recoveryLoopRef.current) return false;
      recoveryLoopRef.current = true;

      try {
        let result =
          direction === "next"
            ? await tvDiscoveryNextStation()
            : await tvDiscoveryPreviousStation();

        while (requestId === navRequestRef.current) {
          if (result.ok) {
            return applyPlayResult(result);
          }

          if (result.error === TV_NAV_STALE) {
            return false;
          }

          if (result.exhausted || result.error === TV_NAV_EXHAUSTED) {
            const extended = await exploreForwardUntilPlayable();
            if (requestId !== navRequestRef.current) return false;
            if (extended.ok) {
              return applyPlayResult(extended);
            }
            if (extended.error === TV_NAV_STALE) return false;
            break;
          }

          result = await exploreForwardUntilPlayable();
        }

        return false;
      } finally {
        recoveryLoopRef.current = false;
      }
    },
    [applyPlayResult]
  );

  const handleCandidateFailure = useCallback(
    async (reason: string) => {
      const pending = candidateRef.current;
      if (!pending || recoveryLoopRef.current) return;

      markTvSessionStationFailed(pending.stationId, reason);
      await recordTvPlaybackFailure(pending.stationId);
      releaseTvSessionPendingCandidate();

      candidateRef.current = null;
      setCandidate(null);
      stopStagingStream();

      const requestId = ++navRequestRef.current;
      setPhase("loading");

      const recovered = await runRecoveryLoop(requestId, "next");
      if (!recovered && requestId === navRequestRef.current) {
        if (confirmedRef.current) {
          setPhase("idle");
          setStreamMounted(true);
          return;
        }
        stopAllStreams();
        setPhase("exhausted");
      }
    },
    [runRecoveryLoop, stopAllStreams, stopStagingStream]
  );

  const handleCandidateReady = useCallback(() => {
    stopStagingStream();
    promoteCandidate();
  }, [promoteCandidate, stopStagingStream]);

  useEffect(() => {
    confirmedRef.current = confirmed;
  }, [confirmed]);

  useEffect(() => {
    candidateRef.current = candidate;
  }, [candidate]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const initialCandidate: TvDisplayStation = {
      stationId: readRouteParam(params.id).trim(),
      title: readRouteParam(params.title).trim(),
      streamUrl: readRouteParam(params.streamUrl).trim(),
      sourceType: readRouteParam(params.sourceType).trim() || "hls_stream",
      artwork: readRouteParam(params.artwork).trim(),
      category: readRouteParam(params.category).trim(),
      country: readRouteParam(params.country).trim(),
      contextLine: routeHierarchyLabel || routeContextTitle || "Hidden Tunes TV",
      resolutionSequence: readRouteParam(params.resolutionSequence).trim(),
    };

    if (!initialCandidate.streamUrl || !initialCandidate.stationId) {
      const requestId = ++navRequestRef.current;
      setPhase("loading");
      void runRecoveryLoop(requestId, "next").then((recovered) => {
        if (!recovered && requestId === navRequestRef.current) {
          setPhase("exhausted");
        }
      });
      return;
    }

    if (isPreResolvedInitialStation(initialCandidate)) {
      confirmResolvedInitialStation(initialCandidate);
      return;
    }

    beginCandidate(initialCandidate);
  }, [
    beginCandidate,
    confirmResolvedInitialStation,
    params,
    routeContextTitle,
    routeHierarchyLabel,
    runRecoveryLoop,
  ]);

  useEffect(() => {
    syncPositionLabel();
  }, [confirmed?.stationId, syncPositionLabel]);

  useEffect(() => {
    isStreamPlayingRef.current = isStreamPlaying;
  }, [isStreamPlaying]);

  useEffect(() => {
    if (phase !== "loading" || !candidate) return;

    const timer = setTimeout(() => {
      if (candidateRef.current) {
        void handleCandidateFailure("probe_timeout");
      }
    }, 20000);

    return () => clearTimeout(timer);
  }, [candidate?.stationId, candidate?.streamUrl, handleCandidateFailure, phase]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const active = nextState === "active";
      setAppActive(active);
      if (!active) {
        // Keep the live stream playing so iOS PiP / background audio can continue.
        // Pausing here was killing Picture-in-Picture and background TV playback
        // in standalone Preview builds (Metro appeared fine under __DEV__ timing).
        wasPlayingBeforeBackgroundRef.current = isStreamPlayingRef.current;
        return;
      }

      if (confirmedRef.current?.streamUrl && wasPlayingBeforeBackgroundRef.current) {
        setStreamMounted(true);
        // Re-assert play after return from background/PiP in case the OS suspended media.
        resumeTvWebViewPlayback(displayWebViewRef);
        setIsStreamPlaying(true);
      }
    });

    return () => subscription.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        stopAllStreams();
      };
    }, [stopAllStreams])
  );

  useEffect(() => {
    return () => {
      releaseTvPlayerRuntime({ webViewRef: displayWebViewRef, clearSession: true });
      releaseTvPlayerRuntime({ webViewRef: stagingWebViewRef, clearSession: false });
    };
  }, []);

  const handleArtworkError = useCallback(() => {
    if (confirmed?.artwork) {
      markTvArtworkLoadFailure(confirmed.artwork);
    }
    setArtworkFailed(true);
  }, [confirmed?.artwork]);

  const handlePlayingStateChange = useCallback((playing: boolean) => {
    setIsStreamPlaying(playing);
  }, []);

  const toggleStreamPlayback = useCallback(() => {
    if (!confirmedRef.current?.streamUrl || phase === "exhausted" || phase === "loading") {
      return;
    }

    if (isStreamPlaying) {
      pauseTvWebViewPlayback(displayWebViewRef);
      setIsStreamPlaying(false);
      return;
    }

    resumeTvWebViewPlayback(displayWebViewRef);
    setIsStreamPlaying(true);
  }, [isStreamPlaying, phase]);

  const navigateStation = useCallback(
    async (direction: "next" | "previous") => {
      if (phase === "loading" || phase === "exhausted" || recoveryLoopRef.current) {
        if (direction === "next") {
          logTvNext("tv_next_candidate_rejected", {
            reason: "transition_already_pending",
            phase,
          });
        }
        return;
      }

      const requestId = ++navRequestRef.current;
      if (direction === "next") {
        logTvNext("tv_next_pressed", {
          confirmedStationId: confirmedRef.current?.stationId || "",
        });
        logTvNext("tv_next_generation_started", {
          generation: requestId,
        });
      }
      setPhase("loading");

      const recovered = await runRecoveryLoop(requestId, direction);
      if (!recovered && requestId === navRequestRef.current) {
        if (direction === "next") {
          logTvNext("tv_next_exhausted", { generation: requestId });
        }
        if (confirmedRef.current) {
          setPhase("idle");
          if (confirmedRef.current.streamUrl) {
            setStreamMounted(true);
          }
          return;
        }
        setPhase("exhausted");
      }
    },
    [phase, runRecoveryLoop]
  );

  const returnToBrowse = useCallback(() => {
    exitTvPlayer();
    router.replace(browseReturnPath as any);
  }, [browseReturnPath, exitTvPlayer]);

  const isProbing = phase === "loading" && Boolean(candidate);
  const visibleStation = confirmed ?? (!confirmed && isProbing ? candidate : null);
  const backgroundProbe = confirmed && isProbing ? candidate : null;
  const canRenderPlayer = streamMounted && appActive && phase !== "exhausted";
  const showVisibleStream = Boolean(visibleStation?.streamUrl) && canRenderPlayer;
  const showBackgroundProbe = Boolean(backgroundProbe?.streamUrl) && canRenderPlayer;
  const headerTitle = confirmed?.title || "Hidden Tunes TV";
  const isLoading = phase === "loading";
  const isTransitioning = isProbing && Boolean(confirmed);
  const isInitialProbe = isProbing && !confirmed;

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Go back"
            onPress={() => {
              exitTvPlayer();
              router.back();
            }}
            style={styles.iconButton}
          >
            <Ionicons name="chevron-back" size={26} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>HIDDEN TUNES TV</Text>
            <Text numberOfLines={1} style={styles.title}>
              {headerTitle}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Back to browse"
            onPress={returnToBrowse}
            style={styles.iconButton}
          >
            <Ionicons name="grid-outline" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.playerFrame}>
          {phase === "exhausted" ? (
            <View style={styles.exhaustedState}>
              <Text style={styles.exhaustedTitle}>
                No more playable stations are available right now.
              </Text>
              <TouchableOpacity style={styles.exhaustedButton} onPress={returnToBrowse}>
                <Text style={styles.exhaustedButtonText}>Return to TV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exhaustedButton, styles.exhaustedButtonSecondary]}
                onPress={() => {
                  exitTvPlayer();
                  router.replace("/youtube-feed" as any);
                }}
              >
                <Text style={styles.exhaustedButtonText}>Choose another category</Text>
              </TouchableOpacity>
            </View>
          ) : showVisibleStream || showBackgroundProbe ? (
            <>
              {showVisibleStream && visibleStation ? (
                <TvStreamPlayer
                  stationId={visibleStation.stationId}
                  streamUrl={visibleStation.streamUrl}
                  webViewRef={displayWebViewRef}
                  onPlaybackReady={isInitialProbe ? handleCandidateReady : () => {}}
                  onPlaybackFailed={isInitialProbe ? handleCandidateFailure : () => {}}
                  onPlayingStateChange={handlePlayingStateChange}
                />
              ) : null}
              {showBackgroundProbe && backgroundProbe ? (
                <View style={styles.stagingWebView} pointerEvents="none">
                  <TvStreamPlayer
                    stationId={backgroundProbe.stationId}
                    streamUrl={backgroundProbe.streamUrl}
                    webViewRef={stagingWebViewRef}
                    onPlaybackReady={handleCandidateReady}
                    onPlaybackFailed={handleCandidateFailure}
                    onPlayingStateChange={() => {}}
                  />
                </View>
              ) : null}
              {isTransitioning || isInitialProbe ? (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                  <Text style={styles.loadingText}>
                    {isInitialProbe ? "Preparing your station…" : "Finding another station…"}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.emptyText}>Finding another station…</Text>
            </View>
          )}
        </View>

        <View style={styles.details}>
          {confirmed ? (
            <>
              <TvStationDetails
                title={confirmed.title}
                artwork={confirmed.artwork}
                category={confirmed.category}
                country={confirmed.country}
                contextLine={confirmed.contextLine}
                positionLabel={positionLabel}
                sourceType={confirmed.sourceType}
                artworkFailed={artworkFailed}
                onArtworkError={handleArtworkError}
              />

              <View style={styles.controlsRow}>
                <TouchableOpacity
                  accessibilityLabel="Previous station"
                  disabled={isLoading || phase === "exhausted"}
                  onPress={() => void navigateStation("previous")}
                  style={[
                    styles.controlButton,
                    (isLoading || phase === "exhausted") && styles.controlButtonDisabled,
                  ]}
                >
                  <Ionicons name="play-skip-back" size={22} color={COLORS.text} />
                  <Text style={styles.controlLabel}>Previous</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityLabel={isStreamPlaying ? "Pause station" : "Resume station"}
                  disabled={isLoading || phase === "exhausted"}
                  onPress={toggleStreamPlayback}
                  style={[
                    styles.controlButton,
                    styles.controlButtonCenter,
                    (isLoading || phase === "exhausted") && styles.controlButtonDisabled,
                  ]}
                >
                  <Ionicons
                    name={isStreamPlaying ? "pause" : "play"}
                    size={24}
                    color={COLORS.text}
                  />
                  <Text style={styles.controlLabel}>
                    {isStreamPlaying ? "Pause" : "Resume"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityLabel="Next station"
                  disabled={isLoading || phase === "exhausted"}
                  onPress={() => void navigateStation("next")}
                  style={[
                    styles.controlButton,
                    styles.controlButtonPrimary,
                    (isLoading || phase === "exhausted") && styles.controlButtonDisabled,
                  ]}
                >
                  <Ionicons name="play-skip-forward" size={22} color={COLORS.backgroundDeep} />
                  <Text style={[styles.controlLabel, styles.controlLabelPrimary]}>Next</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : isLoading ? (
            <View style={styles.detailsLoading}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.detailsLoadingText}>Preparing your station…</Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 18,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingBottom: 18,
    paddingTop: 14,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 28,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 4,
  },
  playerFrame: {
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderColor: COLORS.borderSoft,
    borderRadius: 28,
    borderWidth: 1,
    overflow: "hidden",
    width: "100%",
  },
  webView: {
    backgroundColor: "#000",
    flex: 1,
  },
  stagingWebView: {
    height: 360,
    left: -2000,
    opacity: 0,
    overflow: "hidden",
    position: "absolute",
    top: 0,
    width: 640,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  emptyState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
  exhaustedState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  exhaustedTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
    marginBottom: 8,
    textAlign: "center",
  },
  exhaustedButton: {
    alignItems: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    minWidth: 220,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  exhaustedButtonSecondary: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  exhaustedButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  details: {
    backgroundColor: "rgba(18,7,31,0.68)",
    borderColor: COLORS.borderSoft,
    borderRadius: 28,
    borderWidth: 1,
    marginTop: 24,
    padding: 20,
    minHeight: 120,
  },
  detailsLoading: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 24,
  },
  detailsLoadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  stationRow: {
    flexDirection: "row",
    gap: 16,
  },
  artwork: {
    borderRadius: 18,
    height: 88,
    width: 88,
  },
  artworkFallback: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    height: 88,
    justifyContent: "center",
    width: 88,
  },
  artworkInitials: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
  },
  stationCopy: {
    flex: 1,
  },
  badge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    color: COLORS.backgroundDeep,
    fontSize: 12,
    fontWeight: "900",
  },
  nowPlayingTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 12,
  },
  metaLine: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 6,
  },
  contextLine: {
    color: COLORS.cyan,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8,
  },
  positionLine: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  sourceType: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
    textTransform: "capitalize",
  },
  controlsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
  },
  controlButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    flex: 1,
    gap: 6,
    paddingVertical: 14,
  },
  controlButtonCenter: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  controlButtonPrimary: {
    backgroundColor: COLORS.primary,
  },
  controlButtonDisabled: {
    opacity: 0.55,
  },
  controlLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  controlLabelPrimary: {
    color: COLORS.backgroundDeep,
  },
});
