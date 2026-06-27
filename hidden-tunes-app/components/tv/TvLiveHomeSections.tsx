import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import TvChannelRail from "@/components/tv/TvChannelRail";
import TvMatureGateSection from "@/components/tv/TvMatureGateSection";
import { COLORS } from "@/constants/theme";
import { getTvChannelById } from "@/data/tvChannelSeedCatalog";
import { getMatureTvEnabled } from "@/services/matureTvPreferences";
import {
  LIVE_TV_HOME_SECTIONS,
  TV_CHANNEL_PAGE_SIZE,
  filterPlayableTvChannels,
  getRecommendedTvChannels,
  getTvChannelsForSection,
  hasActiveMatureTvChannels,
} from "@/services/tv/tvChannelService";
import { isMatureTvTestModeEnabled } from "@/services/tv/matureTvTestMode";
import { loadTvChannelRuntimeStatus } from "@/services/tv/tvChannelRuntimeStatus";
import { runTvChannelVerificationIfDue } from "@/services/tv/tvChannelVerification";
import { loadTvFavorites } from "@/services/tv/tvFavorites";
import { loadTvRecentlyWatched } from "@/services/tv/tvRecentlyWatched";
import type { TVChannel, TvLiveSectionId } from "@/types/tv";
import { openTvChannelPlayer } from "@/utils/tvNavigation";
import { useMountedRef } from "@/utils/useMountedRef";

type TvLiveHomeSectionsProps = {
  matureEnabled: boolean;
  onMatureEnabledChange: (enabled: boolean) => void;
};

function TvLiveHomeSections({
  matureEnabled,
  onMatureEnabledChange,
}: TvLiveHomeSectionsProps) {
  const mountedRef = useMountedRef();
  const [loading, setLoading] = useState(true);
  const [recentChannels, setRecentChannels] = useState<TVChannel[]>([]);
  const [favoriteChannels, setFavoriteChannels] = useState<TVChannel[]>([]);
  const [matureChannels, setMatureChannels] = useState<TVChannel[]>([]);
  const [sectionChannels, setSectionChannels] = useState<
    Record<string, TVChannel[]>
  >({});
  const [sectionHasMore, setSectionHasMore] = useState<Record<string, boolean>>(
    {}
  );
  const [loadingMoreSection, setLoadingMoreSection] = useState<string | null>(
    null
  );

  const recommendedChannels = useMemo(() => getRecommendedTvChannels(16), []);

  const activeMatureChannels = useMemo(
    () => hasActiveMatureTvChannels(matureEnabled),
    [matureEnabled]
  );

  const hydrateSections = useCallback(async () => {
    await loadTvChannelRuntimeStatus();

    const nextSections: Record<string, TVChannel[]> = {};
    const nextHasMore: Record<string, boolean> = {};

    for (const section of LIVE_TV_HOME_SECTIONS) {
      const result = getTvChannelsForSection(section.id, matureEnabled, {
        offset: 0,
        limit: TV_CHANNEL_PAGE_SIZE,
      });
      nextSections[section.id] = result.channels;
      nextHasMore[section.id] = result.hasMore;
    }

    if (!mountedRef.current) return;

    setSectionChannels(nextSections);
    setSectionHasMore(nextHasMore);
    setMatureChannels(
      getTvChannelsForSection("mature", matureEnabled, {
        offset: 0,
        limit: TV_CHANNEL_PAGE_SIZE,
      }).channels
    );
    setLoading(false);

    const [recent, favorites] = await Promise.all([
      loadTvRecentlyWatched(),
      loadTvFavorites(),
    ]);

    if (!mountedRef.current) return;

    setRecentChannels(
      filterPlayableTvChannels(
        recent
          .map((entry) => getTvChannelById(entry.channelId))
          .filter((channel): channel is TVChannel => channel !== null),
        matureEnabled
      ).slice(0, 16)
    );
    setFavoriteChannels(
      filterPlayableTvChannels(
        favorites
          .map((entry) => getTvChannelById(entry.channelId))
          .filter((channel): channel is TVChannel => channel !== null),
        matureEnabled
      ).slice(0, 16)
    );
  }, [matureEnabled, mountedRef]);

  useEffect(() => {
    void (async () => {
      await hydrateSections();

      const catalogChanged = await runTvChannelVerificationIfDue();
      if (catalogChanged && mountedRef.current) {
        await hydrateSections();
      }
    })();
  }, [hydrateSections, mountedRef]);

  const openFromSection = useCallback(
    (sectionId: TvLiveSectionId, channel: TVChannel, channelIds: string[]) => {
      openTvChannelPlayer(channel, {
        sectionId,
        channelIds,
        matureEnabled,
      });
    },
    [matureEnabled]
  );

  const loadMoreForSection = useCallback(
    async (sectionId: TvLiveSectionId) => {
      if (loadingMoreSection) return;

      setLoadingMoreSection(sectionId);
      const current = sectionChannels[sectionId] || [];
      const result = getTvChannelsForSection(sectionId, matureEnabled, {
        offset: current.length,
        limit: TV_CHANNEL_PAGE_SIZE,
      });

      if (!mountedRef.current) return;

      setSectionChannels((prev) => ({
        ...prev,
        [sectionId]: [...current, ...result.channels],
      }));
      setSectionHasMore((prev) => ({
        ...prev,
        [sectionId]: result.hasMore,
      }));
      setLoadingMoreSection(null);
    },
    [loadingMoreSection, matureEnabled, mountedRef, sectionChannels]
  );

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Live TV...</Text>
      </View>
    );
  }

  return (
    <View>
      {LIVE_TV_HOME_SECTIONS.map((section) => {
        const channels = sectionChannels[section.id] || [];
        if (!channels.length) return null;

        const channelIds = channels.map((channel) => channel.id);

        return (
          <View key={section.id}>
            <TvChannelRail
              title={section.title}
              channels={channels}
              onPressChannel={(channel) =>
                openFromSection(section.id, channel, channelIds)
              }
            />

            {sectionHasMore[section.id] ? (
              <TouchableOpacity
                style={styles.loadMoreButton}
                activeOpacity={0.88}
                onPress={() => loadMoreForSection(section.id)}
              >
                {loadingMoreSection === section.id ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.loadMoreText}>Load more channels</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}

      {recentChannels.length ? (
        <TvChannelRail
          title="Recently Watched"
          channels={recentChannels}
          onPressChannel={(channel) =>
            openFromSection(
              "recent",
              channel,
              recentChannels.map((entry) => entry.id)
            )
          }
        />
      ) : null}

      {recommendedChannels.length ? (
        <TvChannelRail
          title="Recommended"
          channels={recommendedChannels}
          onPressChannel={(channel) =>
            openFromSection(
              "recommended",
              channel,
              recommendedChannels.map((entry) => entry.id)
            )
          }
        />
      ) : null}

      {favoriteChannels.length ? (
        <TvChannelRail
          title="Favorite Channels"
          channels={favoriteChannels}
          onPressChannel={(channel) =>
            openFromSection(
              "favorites",
              channel,
              favoriteChannels.map((entry) => entry.id)
            )
          }
        />
      ) : null}

      <TvMatureGateSection
        matureEnabled={matureEnabled}
        onMatureEnabledChange={onMatureEnabledChange}
        hasActiveMatureChannels={activeMatureChannels}
        testModeEnabled={isMatureTvTestModeEnabled()}
      />

      {matureEnabled && matureChannels.length ? (
        <TvChannelRail
          title={
            isMatureTvTestModeEnabled()
              ? "Mature TV — Gate Playback Tests"
              : "Mature TV"
          }
          channels={matureChannels}
          onPressChannel={(channel) =>
            openFromSection(
              "mature",
              channel,
              matureChannels.map((entry) => entry.id)
            )
          }
        />
      ) : null}
    </View>
  );
}

export default memo(TvLiveHomeSections);

export async function preloadMatureTvPreference() {
  return getMatureTvEnabled();
}

const styles = StyleSheet.create({
  loadingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
  },

  loadingText: {
    color: COLORS.textMuted,
    marginTop: 10,
    fontSize: 12,
    fontWeight: "800",
  },

  loadMoreButton: {
    alignSelf: "flex-start",
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    marginBottom: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  loadMoreText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "800",
  },
});
