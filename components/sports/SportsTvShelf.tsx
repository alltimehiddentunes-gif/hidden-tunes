/**
 * Live Sports TV shelf — entry surface into the existing TV playback owner.
 * Does not mount expo-video / WebView; taps call openTvDiscoveryStation.
 */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { sportsFixtureGridColumns } from "@/lib/sports/ui/fixtureGridColumns";
import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";
import type { HiddenTunesTvVideo } from "@/services/tvCatalogApi";
import { openTvDiscoveryStation } from "@/services/tvDiscoveryOpen";
import { buildTvDiscoveryLaunchContext } from "@/utils/tvDiscoveryLaunchContext";
import {
  createTapGuardState,
  shouldIgnoreDuplicateTap,
} from "@/utils/tapPressGuard";

import SportsHorizontalShelf from "./SportsHorizontalShelf";
import SportsTvChannelCard from "./SportsTvChannelCard";

export type SportsTvShelfProps = {
  videos: HiddenTunesTvVideo[];
  loading?: boolean;
  loadingMore?: boolean;
  error?: string | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  emptyMessage?: string;
};

function SportsTvShelf({
  videos,
  loading = false,
  loadingMore = false,
  error = null,
  hasMore = false,
  onLoadMore,
  onRetry,
  emptyMessage = "No playable sports channels are available right now.",
}: SportsTvShelfProps) {
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.max(0, windowWidth - 36);
  const columns = sportsFixtureGridColumns(contentWidth, { minCardWidth: 140 });
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const tapGuard = useRef(createTapGuardState());
  const openingRef = useRef(false);
  const videosRef = useRef(videos);

  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  const onPressChannel = useCallback(async (video: HiddenTunesTvVideo) => {
    if (openingRef.current) return;
    if (shouldIgnoreDuplicateTap(tapGuard.current, `tv:${video.id}`)) return;
    openingRef.current = true;
    setConnectingId(video.id);
    try {
      // Handoff once — existing TV owner resolves playability on tap only.
      await openTvDiscoveryStation(video, {
        queueVideos: videosRef.current,
        discoveryContext: buildTvDiscoveryLaunchContext(video, {
          categorySlug: "sports",
          categoryTitle: "Sports",
          laneId: "sports",
          laneTitle: "Live Sports TV",
          browseReturnPath: "/sports",
        }),
      });
    } finally {
      openingRef.current = false;
      setConnectingId(null);
    }
  }, []);

  if (loading && !videos.length) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={SPORTS_COLORS.amber} />
        <Text style={styles.hint}>Loading sports channels…</Text>
      </View>
    );
  }

  if (error && !videos.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        {onRetry ? (
          <Pressable onPress={onRetry} hitSlop={10}>
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (!videos.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View>
      <SportsHorizontalShelf columns={columns} maxItems={videos.length} gap={10}>
        {videos.map((video) => (
          <SportsTvChannelCard
            key={video.id}
            video={video}
            connecting={connectingId === video.id}
            onPress={onPressChannel}
          />
        ))}
      </SportsHorizontalShelf>
      {hasMore ? (
        <Pressable
          style={styles.moreBtn}
          onPress={onLoadMore}
          disabled={loadingMore}
          hitSlop={8}
        >
          {loadingMore ? (
            <ActivityIndicator color={SPORTS_COLORS.amber} size="small" />
          ) : (
            <Text style={styles.moreText}>Load more channels</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

export default memo(SportsTvShelf);

const styles = StyleSheet.create({
  center: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: "flex-start",
    gap: 8,
  },
  hint: {
    color: SPORTS_COLORS.textDim,
    fontSize: 12,
    fontWeight: "600",
  },
  errorText: {
    color: SPORTS_COLORS.danger,
    fontSize: 12,
    fontWeight: "600",
  },
  retry: {
    color: SPORTS_COLORS.amber,
    fontSize: 12,
    fontWeight: "800",
  },
  moreBtn: {
    marginHorizontal: 18,
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
    alignItems: "center",
  },
  moreText: {
    color: SPORTS_COLORS.amber,
    fontSize: 12,
    fontWeight: "800",
  },
});
