import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { type WebViewMessageEvent } from "react-native-webview";

import { getMobileBottomNavContentInset } from "@/components/navigation/navigationConfig";
import { COLORS, GRADIENTS } from "@/constants/theme";
import { getMatureTvEnabled } from "@/services/matureTvPreferences";
import { markTvChannelBroken } from "@/services/tv/tvBrokenChannels";
import { markTvChannelTemporarilyUnavailable } from "@/services/tv/tvChannelVerification";
import { getRelatedTvChannels } from "@/services/tv/tvChannelService";
import {
  isTvChannelFavorite,
  subscribeTvFavorites,
  toggleTvChannelFavorite,
} from "@/services/tv/tvFavorites";
import type { HiddenTunesTvVideo } from "@/services/tvCatalogApi";
import type { TVChannel, TvPresentationMode } from "@/types/tv";
import { formatTvChannelTitle } from "@/utils/formatTvChannelDisplay";
import {
  getTvChannelInitials,
  getTvDisplaySubtitle,
  markTvArtworkLoadFailure,
  resolveTvArtworkUrl,
  shouldShowTvVerifiedBadge,
} from "@/utils/tvArtwork";
import { getHorizontalListPerformanceSettings } from "@/utils/performanceMode";
import { navigateTvPlayerBack } from "@/utils/tvNavigation";
import { useMountedRef } from "@/utils/useMountedRef";

import TvChannelCard from "./TvChannelCard";
import TvNativeVideoSurface, {
  type TvNativeVideoHandle,
} from "./TvNativeVideoSurface";
import type { TvPlaybackSurface } from "@/services/tv/tvPlaybackSurface";

type TvPlayerHostProps = {
  html: string;
  streamUrl: string;
  surface: TvPlaybackSurface;
  playerGeneration: number;
  presentationMode: Exclude<TvPresentationMode, "closed">;
  item: HiddenTunesTvVideo;
  seedChannel: TVChannel | null;
  isPlaying: boolean;
  isLoading: boolean;
  hasError: boolean;
  webViewRef: RefObject<WebView | null>;
  nativePlayerRef: RefObject<TvNativeVideoHandle | null>;
  onMessage: (event: WebViewMessageEvent) => void;
  onNativePlaying: () => void;
  onNativePaused: () => void;
  onStop: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onTogglePlayback: () => void;
  onMinimize: () => void;
  onExpand: () => void;
  onRetry: () => void;
  onSelectSeedChannel: (channel: TVChannel) => void;
  onReportError: () => void;
};

function formatCategoryLabel(category: string) {
  const cleaned = String(category || "").trim();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Strip ingestion/debug dumps that must never reach the user-facing player. */
function getUserFacingStationBlurb(raw: string | null | undefined): string {
  const text = String(raw || "").trim();
  if (!text) return "";

  const lower = text.toLowerCase();
  const debugMarkers = [
    "provider:",
    "legal basis",
    "legal_basis",
    "station id",
    "station_id",
    "discovered:",
    "official-fast-providers",
    "catalog wave",
    "wave4",
    "validation",
    "source_type",
    "ingestion",
  ];
  if (debugMarkers.some((marker) => lower.includes(marker))) {
    return "";
  }
  if (/https?:\/\//i.test(text) && (lower.includes("official") || text.includes("\n"))) {
    return "";
  }
  if ((text.match(/\n/g) || []).length >= 2) {
    return "";
  }
  // Keep short human blurbs only.
  if (text.length > 160) return "";
  return text;
}

function resolveStationArtworkUri(
  channel: TVChannel | null,
  item: HiddenTunesTvVideo
): string {
  const fromChannel = String(channel?.logoUrl || "").trim();
  if (fromChannel) return fromChannel;
  return resolveTvArtworkUrl(item);
}

function StationArtworkMark({
  uri,
  title,
  size,
}: {
  uri: string;
  title: string;
  size: number;
}) {
  const [failed, setFailed] = useState(!uri);
  const initials = getTvChannelInitials(title);
  const radius = Math.round(size * 0.22);

  if (failed || !uri) {
    return (
      <LinearGradient
        colors={["rgba(168,85,247,0.42)", "rgba(34,211,238,0.12)", "rgba(8,2,18,0.95)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.artworkFallback,
          { width: size, height: size, borderRadius: radius },
        ]}
      >
        <View style={styles.artworkFallbackGlow} />
        <Text style={[styles.artworkInitials, { fontSize: Math.round(size * 0.28) }]}>
          {initials}
        </Text>
      </LinearGradient>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: radius }}
      contentFit="cover"
      recyclingKey={uri}
      cachePolicy="memory-disk"
      priority="high"
      onError={() => {
        markTvArtworkLoadFailure(uri);
        setFailed(true);
      }}
    />
  );
}

/**
 * Single TV session host. Presentation mode only changes layout styles —
 * the video surface stays on a stable tree path so floating ↔ full does not remount.
 */
function TvPlayerHost({
  html,
  streamUrl,
  surface,
  playerGeneration,
  presentationMode,
  item,
  seedChannel,
  isPlaying,
  isLoading,
  hasError,
  webViewRef,
  nativePlayerRef,
  onMessage,
  onNativePlaying,
  onNativePaused,
  onStop,
  onNext,
  onPrevious,
  onTogglePlayback,
  onMinimize,
  onExpand,
  onRetry,
  onSelectSeedChannel,
  onReportError,
}: TvPlayerHostProps) {
  const mountedRef = useMountedRef();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [isFavorite, setIsFavorite] = useState(false);
  const [relatedChannels, setRelatedChannels] = useState<TVChannel[]>([]);
  const full = presentationMode === "fullPlayer";
  const displayChannel = seedChannel;
  const rawTitle = displayChannel?.name || item.title || "Hidden Tunes TV";
  const title = formatTvChannelTitle(rawTitle) || rawTitle;
  const artworkUri = useMemo(
    () => resolveStationArtworkUri(displayChannel, item),
    [displayChannel, item]
  );
  const regionLabel = useMemo(() => {
    if (displayChannel?.country) return displayChannel.country;
    return getTvDisplaySubtitle(item) || item.country || "";
  }, [displayChannel, item]);
  const categoryLabel = useMemo(() => {
    if (displayChannel?.category) return formatCategoryLabel(displayChannel.category);
    return (
      formatCategoryLabel(item.category || "") ||
      formatCategoryLabel(item.categories?.[0] || "") ||
      formatCategoryLabel(item.genre || "")
    );
  }, [displayChannel, item]);
  const metaLine = useMemo(() => {
    return [regionLabel, categoryLabel].filter(Boolean).join(" · ");
  }, [categoryLabel, regionLabel]);
  const userBlurb = useMemo(
    () =>
      getUserFacingStationBlurb(displayChannel?.description || item.description || ""),
    [displayChannel?.description, item.description]
  );
  const showLiveBadge = Boolean(displayChannel?.isLive ?? true);
  const showFreeBadge = true;
  const showVerifiedBadge = displayChannel
    ? displayChannel.isVerifiedLegal
    : shouldShowTvVerifiedBadge(item);

  /**
   * Deterministic floating layout (same path in Metro and Preview/release).
   * Width matches the original 14pt side margins. Height comes from onLayout
   * so clamp/start position cannot drift between __DEV__ and release.
   * Drag uses RNGH Pan under GestureHandlerRootView — PanResponder is not
   * reliable in standalone Preview builds.
   */
  const floatingCardWidth = Math.max(120, viewportWidth - 28);
  const [floatingCardHeight, setFloatingCardHeight] = useState(166);
  const bottomClearance = getMobileBottomNavContentInset(insets.bottom) + 8;

  const clampFloatingPosition = useCallback(
    (x: number, y: number) => {
      const minX = 8;
      const maxX = Math.max(minX, viewportWidth - floatingCardWidth - 8);
      const minY = Math.max(insets.top, 8);
      const maxY = Math.max(
        minY,
        viewportHeight - floatingCardHeight - bottomClearance
      );
      return {
        x: Math.min(maxX, Math.max(minX, x)),
        y: Math.min(maxY, Math.max(minY, y)),
      };
    },
    [
      bottomClearance,
      floatingCardHeight,
      floatingCardWidth,
      insets.top,
      viewportHeight,
      viewportWidth,
    ]
  );

  const defaultFloatingPosition = useCallback(
    () =>
      clampFloatingPosition(
        14,
        viewportHeight - floatingCardHeight - bottomClearance
      ),
    [
      bottomClearance,
      clampFloatingPosition,
      floatingCardHeight,
      viewportHeight,
    ]
  );

  const [floatPos, setFloatPos] = useState(defaultFloatingPosition);
  const [floatModeKey, setFloatModeKey] = useState(full);
  const floatPosRef = useRef(floatPos);
  const dragOriginRef = useRef(floatPos);
  const clampFloatingPositionRef = useRef(clampFloatingPosition);

  // eslint-disable-next-line react-hooks/refs -- gesture handlers need latest clamp/position
  floatPosRef.current = floatPos;
  // eslint-disable-next-line react-hooks/refs -- gesture handlers need latest clamp/position
  clampFloatingPositionRef.current = clampFloatingPosition;

  // Reset dock position when entering floating mode (props→state sync during render).
  if (full !== floatModeKey) {
    setFloatModeKey(full);
    if (!full) {
      setFloatPos(defaultFloatingPosition());
    }
  }

  // Keep the card inside bounds when safe-area / measured size settles (Preview often
  // reports insets/layout one frame later than Metro).
  useLayoutEffect(() => {
    if (full) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reclamp after measured layout/insets settle
    setFloatPos((prev) => {
      const next = clampFloatingPosition(prev.x, prev.y);
      if (next.x === prev.x && next.y === prev.y) return prev;
      return next;
    });
  }, [clampFloatingPosition, full]);

  const onFloatingCardLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    if (nextHeight > 0) {
      setFloatingCardHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    }
  }, []);

  /* eslint-disable react-hooks/refs -- RNGH callbacks close over refs; gesture instance is stable */
  const floatingPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(6)
        .onBegin(() => {
          dragOriginRef.current = { ...floatPosRef.current };
        })
        .onUpdate((event) => {
          const next = clampFloatingPositionRef.current(
            dragOriginRef.current.x + event.translationX,
            dragOriginRef.current.y + event.translationY
          );
          floatPosRef.current = next;
          setFloatPos(next);
        })
        .onEnd((event) => {
          const next = clampFloatingPositionRef.current(
            dragOriginRef.current.x + event.translationX,
            dragOriginRef.current.y + event.translationY
          );
          floatPosRef.current = next;
          setFloatPos(next);
        }),
    []
  );
  /* eslint-enable react-hooks/refs */

  const canvasWidth = Math.min(viewportWidth - 32, 560);
  const canvasStyle = full
    ? [styles.videoShell, styles.videoShellFull, { width: canvasWidth, alignSelf: "center" as const }]
    : [styles.videoShell, styles.videoShellFloating];

  useEffect(() => {
    if (!full) return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onMinimize();
      navigateTvPlayerBack();
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [full, onMinimize]);

  useEffect(() => {
    if (!displayChannel) {
      setIsFavorite(false);
      setRelatedChannels([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      const favorited = await isTvChannelFavorite(displayChannel.id);
      if (!cancelled && mountedRef.current) setIsFavorite(favorited);
      const matureEnabled = await getMatureTvEnabled();
      const related = getRelatedTvChannels(displayChannel, matureEnabled, 8);
      if (!cancelled && mountedRef.current) setRelatedChannels(related);
    })();

    return subscribeTvFavorites((entries) => {
      if (!mountedRef.current) return;
      setIsFavorite(
        entries.some((entry) => entry.channelId === displayChannel.id)
      );
    });
  }, [displayChannel, mountedRef]);

  const handleToggleFavorite = useCallback(async () => {
    if (!displayChannel) return;
    const previous = isFavorite;
    setIsFavorite(!previous);
    try {
      const result = await toggleTvChannelFavorite(displayChannel);
      if (mountedRef.current) {
        setIsFavorite(result.favorited);
        if (!result.persisted) setIsFavorite(previous);
      }
    } catch {
      if (mountedRef.current) setIsFavorite(previous);
    }
  }, [displayChannel, isFavorite, mountedRef]);

  const handleBack = useCallback(() => {
    onMinimize();
    navigateTvPlayerBack();
  }, [onMinimize]);

  const handleEnterFullscreen = useCallback(() => {
    if (surface === "native") {
      void nativePlayerRef.current?.enterFullscreen?.();
      return;
    }
    webViewRef.current?.injectJavaScript(`
      (function () {
        try {
          var video = document.getElementById("player");
          if (video) {
            if (video.webkitEnterFullscreen) {
              video.webkitEnterFullscreen();
              return;
            }
            if (video.requestFullscreen) {
              video.requestFullscreen();
              return;
            }
          }
          var iframe = document.getElementById("yt");
          if (iframe && iframe.requestFullscreen) {
            iframe.requestFullscreen();
          }
        } catch (e) {}
      })();
      true;
    `);
  }, [nativePlayerRef, surface, webViewRef]);

  const handleReportBroken = useCallback(() => {
    if (!displayChannel) return;
    markTvChannelBroken(displayChannel.id);
    void markTvChannelTemporarilyUnavailable(
      displayChannel.id,
      "playback_failed"
    );
    onReportError();
  }, [displayChannel, onReportError]);

  const relatedListSettings = useMemo(
    () => getHorizontalListPerformanceSettings(relatedChannels.length),
    [relatedChannels.length]
  );

  const renderRelatedChannel = useCallback(
    ({ item: channel }: { item: TVChannel }) => (
      <TvChannelCard channel={channel} onPress={onSelectSeedChannel} />
    ),
    [onSelectSeedChannel]
  );

  const playerCanvas = (
    <View style={canvasStyle} collapsable={false}>
      {hasError ? (
        <LinearGradient
          colors={["rgba(24,10,42,0.98)", "rgba(6,2,12,0.98)", "#000"]}
          style={styles.errorCanvas}
        >
          {artworkUri ? (
            <Image
              source={{ uri: artworkUri }}
              style={styles.errorArtworkWash}
              contentFit="cover"
              blurRadius={18}
              recyclingKey={`wash-${item.id}`}
              cachePolicy="memory-disk"
              priority="low"
            />
          ) : null}
          <View style={styles.errorContent}>
            <View style={styles.errorIconWrap}>
              <Ionicons name="cloud-offline-outline" size={22} color={COLORS.textMuted} />
            </View>
            <Text style={styles.errorTitle}>Stream temporarily unavailable</Text>
            <Text style={styles.errorSub}>
              We couldn't start this channel. Try again or continue to another
              station.
            </Text>
            <View style={styles.errorActions}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={onRetry}
                accessibilityRole="button"
                accessibilityLabel="Retry"
              >
                <Text style={styles.primaryButtonText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onNext}
                accessibilityRole="button"
                accessibilityLabel="Next channel"
              >
                <Text style={styles.secondaryButtonText}>Next channel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      ) : surface === "native" && streamUrl ? (
        <TvNativeVideoSurface
          key={`tv-native-${playerGeneration}`}
          ref={nativePlayerRef}
          streamUrl={streamUrl}
          onPlaying={onNativePlaying}
          onPaused={onNativePaused}
          onError={onReportError}
        />
      ) : surface === "webview" && html ? (
        <WebView
          key={`tv-session-${playerGeneration}`}
          ref={webViewRef}
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
          onError={onReportError}
          onHttpError={onReportError}
        />
      ) : (
        <LinearGradient
          colors={["rgba(24,10,42,0.98)", "rgba(6,2,12,0.98)", "#000"]}
          style={styles.errorCanvas}
        >
          <View style={styles.errorContent}>
            <View style={styles.errorIconWrap}>
              <Ionicons name="cloud-offline-outline" size={22} color={COLORS.textMuted} />
            </View>
            <Text style={styles.errorTitle}>Stream temporarily unavailable</Text>
            <Text style={styles.errorSub}>
              We couldn't start this channel. Try again or continue to another
              station.
            </Text>
            <View style={styles.errorActions}>
              <TouchableOpacity style={styles.primaryButton} onPress={onRetry}>
                <Text style={styles.primaryButtonText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={onNext}>
                <Text style={styles.secondaryButtonText}>Next channel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      )}

      {isLoading && !isPlaying && !hasError ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={COLORS.primary} size="large" />
          {full ? <Text style={styles.loadingText}>Loading stream…</Text> : null}
        </View>
      ) : null}
    </View>
  );

  const body = (
    <>
      <View
        style={[
          full ? styles.topBar : styles.floatingHeader,
          full ? { paddingTop: Math.max(insets.top, 10) } : null,
        ]}
      >
        {full ? (
          <>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.topTitle} numberOfLines={1}>
              {title}
            </Text>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Picture in picture"
            >
              <Ionicons name="browsers-outline" size={18} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onStop}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color={COLORS.text} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.floatingCopy}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={onExpand}
                accessibilityRole="button"
                accessibilityLabel="Restore TV player"
              >
                <Text numberOfLines={1} style={styles.floatingTitle}>
                  {title}
                </Text>
                <Text numberOfLines={1} style={styles.floatingSub}>
                  {isPlaying ? "Live TV playing" : "Live TV paused"}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.headerIcon}
              onPress={onExpand}
            >
              <Ionicons name="expand-outline" size={17} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.headerIcon}
              onPress={onStop}
            >
              <Ionicons name="close" size={18} color={COLORS.text} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {playerCanvas}

      <View style={full ? styles.controlsRow : styles.floatingControls}>
        <TouchableOpacity
          style={full ? styles.fullControlButton : styles.controlButton}
          onPress={onPrevious}
          accessibilityRole="button"
          accessibilityLabel="Previous channel"
        >
          <Ionicons
            name="play-skip-back"
            size={full ? 22 : 17}
            color={COLORS.text}
          />
        </TouchableOpacity>
        {full ? (
          <TouchableOpacity
            style={styles.playButton}
            onPress={onTogglePlayback}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Pause" : "Play"}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={24}
              color="#000"
            />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            activeOpacity={0.86}
            style={styles.stopButton}
            onPress={onStop}
          >
            <Ionicons name="stop" size={17} color="#000" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={full ? styles.fullControlButton : styles.controlButton}
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel="Next channel"
        >
          <Ionicons
            name="play-skip-forward"
            size={full ? 22 : 17}
            color={COLORS.text}
          />
        </TouchableOpacity>
        {full ? (
          <TouchableOpacity
            style={styles.fullControlButton}
            onPress={handleEnterFullscreen}
            accessibilityRole="button"
            accessibilityLabel="Enter fullscreen"
          >
            <Ionicons name="expand" size={22} color={COLORS.text} />
          </TouchableOpacity>
        ) : null}
      </View>

      {full ? (
        <ScrollView
          style={styles.metaScroll}
          contentContainerStyle={[
            styles.metaContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 16 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stationCard}>
            <StationArtworkMark uri={artworkUri} title={title} size={68} />
            <View style={styles.stationCopy}>
              <Text style={styles.channelName} numberOfLines={2}>
                {title}
              </Text>
              {metaLine ? (
                <Text style={styles.channelDetails} numberOfLines={1}>
                  {metaLine}
                </Text>
              ) : null}
              <View style={styles.badgeRow}>
                {showLiveBadge ? (
                  <View style={[styles.badge, styles.badgeLive]}>
                    <View style={styles.liveDot} />
                    <Text style={styles.badgeText}>Live</Text>
                  </View>
                ) : null}
                {showFreeBadge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Free TV</Text>
                  </View>
                ) : null}
                {showVerifiedBadge ? (
                  <View style={styles.badge}>
                    <Ionicons name="shield-checkmark" size={11} color={COLORS.cyan} />
                    <Text style={styles.badgeText}>Verified</Text>
                  </View>
                ) : null}
              </View>
              {userBlurb ? (
                <Text style={styles.channelDescription} numberOfLines={3}>
                  {userBlurb}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.secondaryActions}>
            {displayChannel ? (
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={() => void handleToggleFavorite()}
                accessibilityRole="button"
                accessibilityLabel={isFavorite ? "Unfavorite" : "Favorite"}
              >
                <Ionicons
                  name={isFavorite ? "heart" : "heart-outline"}
                  size={18}
                  color={isFavorite ? COLORS.primary : COLORS.text}
                />
                <Text style={styles.secondaryActionLabel}>Favorite</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Picture in picture"
            >
              <Ionicons name="browsers-outline" size={18} color={COLORS.text} />
              <Text style={styles.secondaryActionLabel}>PiP</Text>
            </TouchableOpacity>
            {displayChannel ? (
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={handleReportBroken}
                accessibilityRole="button"
                accessibilityLabel="Report broken channel"
              >
                <Ionicons name="flag-outline" size={17} color={COLORS.textMuted} />
                <Text style={styles.secondaryActionLabel}>Report</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {relatedChannels.length ? (
            <View style={styles.relatedSection}>
              <Text style={styles.relatedTitle}>Related channels</Text>
              <FlatList
                horizontal
                data={relatedChannels}
                keyExtractor={(entry) => entry.id}
                showsHorizontalScrollIndicator={false}
                renderItem={renderRelatedChannel}
                initialNumToRender={relatedListSettings.initialNumToRender}
                maxToRenderPerBatch={relatedListSettings.maxToRenderPerBatch}
                windowSize={relatedListSettings.windowSize}
                updateCellsBatchingPeriod={
                  relatedListSettings.updateCellsBatchingPeriod
                }
                removeClippedSubviews={relatedListSettings.removeClippedSubviews}
              />
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </>
  );

  const floatingCard = (
    <View
      style={[
        styles.floatingCard,
        {
          left: floatPos.x,
          top: floatPos.y,
          width: floatingCardWidth,
        },
      ]}
      collapsable={false}
      onLayout={onFloatingCardLayout}
    >
      {body}
    </View>
  );

  return (
    <View
      style={full ? styles.fullRoot : styles.floatingRoot}
      pointerEvents={full ? "auto" : "box-none"}
    >
      <View style={styles.bgSlot} pointerEvents="none">
        {full ? (
          <LinearGradient
            colors={GRADIENTS.main}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </View>
      {full ? (
        <View style={styles.fullContainer} collapsable={false}>
          {body}
        </View>
      ) : (
        <GestureDetector gesture={floatingPanGesture}>
          {floatingCard}
        </GestureDetector>
      )}
    </View>
  );
}

export default memo(TvPlayerHost);

const styles = StyleSheet.create({
  floatingRoot: {
    ...StyleSheet.absoluteFill,
    zIndex: 200,
    elevation: 20,
  },
  floatingCard: {
    position: "absolute",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(8,8,12,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    zIndex: 201,
    elevation: 24,
  },
  floatingHeader: {
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  floatingCopy: { flex: 1 },
  floatingTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  floatingSub: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "600",
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
  floatingControls: {
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
  videoShell: {
    backgroundColor: "#000",
    overflow: "hidden",
  },
  videoShellFloating: {
    width: "100%",
    height: 78,
  },
  videoShellFull: {
    aspectRatio: 16 / 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  webView: {
    flex: 1,
    backgroundColor: "#000",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 10,
    fontSize: 12,
    fontWeight: "700",
  },
  errorCanvas: {
    flex: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  errorArtworkWash: {
    ...StyleSheet.absoluteFill,
    opacity: 0.22,
  },
  errorContent: {
    paddingHorizontal: 22,
    alignItems: "center",
    maxWidth: 340,
  },
  errorIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 12,
  },
  errorTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  errorSub: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
    marginTop: 8,
    textAlign: "center",
  },
  errorActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 16,
  },
  fullRoot: {
    ...StyleSheet.absoluteFill,
    zIndex: 300,
    elevation: 30,
  },
  bgSlot: {
    ...StyleSheet.absoluteFill,
  },
  fullContainer: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
    zIndex: 4,
  },
  topTitle: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
    paddingHorizontal: 4,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingVertical: 16,
  },
  fullControlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  metaScroll: { flex: 1 },
  metaContent: {
    paddingHorizontal: 16,
  },
  stationCard: {
    flexDirection: "row",
    gap: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  artworkFallback: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.28)",
  },
  artworkFallbackGlow: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(168,85,247,0.28)",
  },
  artworkInitials: {
    color: COLORS.text,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  stationCopy: { flex: 1, minWidth: 0 },
  channelName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.15,
  },
  channelDetails: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  badgeLive: {
    borderColor: "rgba(34,197,94,0.35)",
    backgroundColor: "rgba(34,197,94,0.12)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  badgeText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  channelDescription: {
    color: COLORS.textDim,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    marginTop: 10,
  },
  secondaryActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  secondaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  secondaryActionLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  relatedSection: { marginTop: 22 },
  relatedTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
  },
  primaryButton: {
    minHeight: 40,
    minWidth: 96,
    borderRadius: 20,
    paddingHorizontal: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 40,
    minWidth: 96,
    borderRadius: 20,
    paddingHorizontal: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
});
