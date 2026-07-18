import { memo, useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import WebView, { type WebViewMessageEvent } from "react-native-webview";

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
import { getHorizontalListPerformanceSettings } from "@/utils/performanceMode";
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
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Single WebView host. Presentation mode only changes layout styles ÔÇö
 * the WebView stays on a stable tree path so floating Ôåö full does not remount.
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
  const [isFavorite, setIsFavorite] = useState(false);
  const [relatedChannels, setRelatedChannels] = useState<TVChannel[]>([]);
  const full = presentationMode === "fullPlayer";
  const displayChannel = seedChannel;
  const title = displayChannel?.name || item.title;

  useEffect(() => {
    if (!full) return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onMinimize();
      if (router.canGoBack()) router.back();
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
    if (router.canGoBack()) router.back();
  }, [onMinimize]);

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

  const body = (
    <>
      <View style={full ? styles.topBar : styles.floatingHeader}>
        {full ? (
          <>
            <TouchableOpacity style={styles.iconButton} onPress={handleBack}>
              <Ionicons name="chevron-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.topTitle} numberOfLines={1}>
              {title}
            </Text>
            {displayChannel ? (
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => void handleToggleFavorite()}
              >
                <Ionicons
                  name={isFavorite ? "heart" : "heart-outline"}
                  size={20}
                  color={isFavorite ? COLORS.primary : COLORS.text}
                />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.iconButton} onPress={onStop}>
                <Ionicons name="close" size={20} color={COLORS.text} />
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            <View style={styles.floatingCopy}>
              <Text numberOfLines={1} style={styles.floatingTitle}>
                {title}
              </Text>
              <Text numberOfLines={1} style={styles.floatingSub}>
                {isPlaying ? "Live TV playing" : "Live TV paused"}
              </Text>
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

      {/* Stable path: Root ÔåÆ Card ÔåÆ videoShell ÔåÆ WebView (never reparented) */}
      <View
        style={[
          styles.videoShell,
          full ? styles.videoShellFull : styles.videoShellFloating,
        ]}
      >
        {hasError ? (
          <View style={styles.errorOverlay}>
            <Ionicons
              name="alert-circle-outline"
              size={42}
              color={COLORS.textMuted}
            />
            <Text style={styles.errorTitle}>Channel unavailable right now</Text>
            <Text style={styles.errorSub}>
              This stream could not be loaded. Try again or skip to another
              channel.
            </Text>
            <View style={styles.errorActions}>
              <TouchableOpacity style={styles.primaryButton} onPress={onRetry}>
                <Text style={styles.primaryButtonText}>Try again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={onNext}>
                <Text style={styles.secondaryButtonText}>Next channel</Text>
              </TouchableOpacity>
            </View>
          </View>
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
          <View style={styles.errorOverlay}>
            <Text style={styles.errorTitle}>Stream format not supported</Text>
          </View>
        )}

        {isLoading && !hasError ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            {full ? (
              <Text style={styles.loadingText}>Loading stream...</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={full ? styles.controlsRow : styles.floatingControls}>
        <TouchableOpacity
          style={full ? styles.fullControlButton : styles.controlButton}
          onPress={onPrevious}
        >
          <Ionicons
            name="play-skip-back"
            size={full ? 22 : 17}
            color={COLORS.text}
          />
        </TouchableOpacity>
        {full ? (
          <TouchableOpacity style={styles.playButton} onPress={onTogglePlayback}>
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
        >
          <Ionicons
            name="play-skip-forward"
            size={full ? 22 : 17}
            color={COLORS.text}
          />
        </TouchableOpacity>
      </View>

      {full ? (
        <ScrollView
          style={styles.metaScroll}
          contentContainerStyle={styles.metaContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.channelMeta}>
            {displayChannel?.logoUrl || item.logo || item.thumbnail_url ? (
              <Image
                source={{
                  uri:
                    displayChannel?.logoUrl ||
                    item.logo ||
                    item.thumbnail_url ||
                    "",
                }}
                style={styles.channelLogo}
                contentFit="contain"
                recyclingKey={item.id}
                cachePolicy="memory-disk"
                priority="low"
              />
            ) : (
              <View style={styles.channelLogoFallback}>
                <Ionicons name="tv" size={24} color={COLORS.primary} />
              </View>
            )}
            <View style={styles.channelCopy}>
              <Text style={styles.channelName}>{title}</Text>
              <Text style={styles.channelDetails}>
                {displayChannel
                  ? `${formatCategoryLabel(displayChannel.category)}${
                      displayChannel.country
                        ? ` ┬À ${displayChannel.country}`
                        : ""
                    }${
                      displayChannel.language
                        ? ` ┬À ${displayChannel.language}`
                        : ""
                    }`
                  : item.categories?.[0] || "TV"}
              </Text>
              {displayChannel?.description || item.description ? (
                <Text style={styles.channelDescription}>
                  {displayChannel?.description || item.description}
                </Text>
              ) : null}
            </View>
          </View>

          {displayChannel ? (
            <TouchableOpacity
              style={styles.reportButton}
              onPress={() => {
                markTvChannelBroken(displayChannel.id);
                void markTvChannelTemporarilyUnavailable(
                  displayChannel.id,
                  "playback_failed"
                );
                onReportError();
              }}
            >
              <Ionicons name="flag-outline" size={16} color={COLORS.textMuted} />
              <Text style={styles.reportText}>Report broken channel</Text>
            </TouchableOpacity>
          ) : null}

          {relatedChannels.length ? (
            <View style={styles.relatedSection}>
              <Text style={styles.relatedTitle}>Related Channels</Text>
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

  // Stable tree: root ÔåÆ bgSlot ÔåÆ card ÔåÆ videoShell ÔåÆ WebView.
  // Mode only changes styles / optional bg gradient; never reparents the WebView.
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
      <View
        style={full ? styles.fullContainer : styles.floatingCard}
        collapsable={false}
      >
        {body}
      </View>
    </View>
  );
}

export default memo(TvPlayerHost);

const styles = StyleSheet.create({
  floatingRoot: {
    ...StyleSheet.absoluteFill,
    justifyContent: "flex-end",
    zIndex: 200,
    elevation: 20,
  },
  floatingCard: {
    marginHorizontal: 14,
    marginBottom: 22,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(8,8,12,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
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
    marginHorizontal: 16,
    aspectRatio: 16 / 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
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
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    paddingVertical: 14,
  },
  fullControlButton: {
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
  metaScroll: { flex: 1 },
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
  channelCopy: { flex: 1 },
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
  relatedSection: { marginTop: 10 },
  relatedTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
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
