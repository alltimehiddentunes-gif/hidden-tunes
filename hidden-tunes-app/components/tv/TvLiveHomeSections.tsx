import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";

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
import { setTvTabFocused } from "@/services/tv/tvPlaybackActivity";
import {
  loadTvFavorites,
  subscribeTvFavorites,
} from "@/services/tv/tvFavorites";
import {
  clearTvRecentlyWatched,
  getContinueWatchingEntries,
  loadTvRecentlyWatched,
  removeTvRecentlyWatched,
} from "@/services/tv/tvRecentlyWatched";
import type {
  TVChannel,
  TvLiveSectionId,
  TvRecentlyWatchedEntry,
} from "@/types/tv";
import { openTvChannelPlayer } from "@/utils/tvNavigation";
import { useMountedRef } from "@/utils/useMountedRef";

type TvLiveHomeSectionsProps = {
  matureEnabled: boolean;
  onMatureEnabledChange: (enabled: boolean) => void;
};

function mapEntriesToChannels(
  entries: TvRecentlyWatchedEntry[],
  matureEnabled: boolean,
  limit = 16
) {
  return filterPlayableTvChannels(
    entries
      .map((entry) => getTvChannelById(entry.channelId))
      .filter((channel): channel is TVChannel => channel !== null),
    matureEnabled
  ).slice(0, limit);
}

function TvLiveHomeSections({
  matureEnabled,
  onMatureEnabledChange,
}: TvLiveHomeSectionsProps) {
  const mountedRef = useMountedRef();
  const [loading, setLoading] = useState(true);
  const [recentEntries, setRecentEntries] = useState<TvRecentlyWatchedEntry[]>(
    []
  );
  const [recentChannels, setRecentChannels] = useState<TVChannel[]>([]);
  const [continueChannels, setContinueChannels] = useState<TVChannel[]>([]);
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
  const [openingChannelId, setOpeningChannelId] = useState<string | null>(null);
  const sectionChannelsRef = useRef<Record<string, TVChannel[]>>({});
  const matureEnabledRef = useRef(matureEnabled);

  const recommendedChannels = useMemo(() => getRecommendedTvChannels(16), []);

  const activeMatureChannels = useMemo(
    () => hasActiveMatureTvChannels(matureEnabled),
    [matureEnabled]
  );

  const progressByChannelId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of recentEntries) {
      if (
        entry.isLive === true ||
        entry.completed ||
        typeof entry.positionSeconds !== "number" ||
        typeof entry.durationSeconds !== "number" ||
        entry.durationSeconds <= 0
      ) {
        continue;
      }
      map[entry.channelId] = Math.min(
        1,
        Math.max(0, entry.positionSeconds / entry.durationSeconds)
      );
    }
    return map;
  }, [recentEntries]);

  const applyRecentEntries = useCallback(
    (recent: TvRecentlyWatchedEntry[]) => {
      setRecentEntries(recent);
      setRecentChannels(mapEntriesToChannels(recent, matureEnabled, 24));
      setContinueChannels(
        mapEntriesToChannels(getContinueWatchingEntries(recent), matureEnabled, 16)
      );
    },
    [matureEnabled]
  );

  const applyFavoriteEntries = useCallback(
    (
      favorites: Awaited<ReturnType<typeof loadTvFavorites>>
    ) => {
      setFavoriteChannels(
        filterPlayableTvChannels(
          favorites
            .map((entry) => getTvChannelById(entry.channelId))
            .filter((channel): channel is TVChannel => channel !== null),
          matureEnabled
        ).slice(0, 24)
      );
    },
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
    sectionChannelsRef.current = nextSections;
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

    applyRecentEntries(recent);
    applyFavoriteEntries(favorites);
  }, [applyFavoriteEntries, applyRecentEntries, matureEnabled, mountedRef]);

  useEffect(() => {
    if (matureEnabledRef.current === matureEnabled) return;
    matureEnabledRef.current = matureEnabled;
    void hydrateSections();
  }, [hydrateSections, matureEnabled]);

  useEffect(() => {
    return subscribeTvFavorites((favorites) => {
      if (!mountedRef.current) return;
      applyFavoriteEntries(favorites);
    });
  }, [applyFavoriteEntries, mountedRef]);

  useFocusEffect(
    useCallback(() => {
      setTvTabFocused(true);

      let active = true;

      const interactionHandle = InteractionManager.runAfterInteractions(() => {
        void (async () => {
          await hydrateSections();
          if (!active) return;

          const catalogChanged = await runTvChannelVerificationIfDue();
          if (catalogChanged && active && mountedRef.current) {
            await hydrateSections();
          }
        })();
      });

      return () => {
        active = false;
        setTvTabFocused(false);
        interactionHandle.cancel();
      };
    }, [hydrateSections, mountedRef])
  );

  const openFromSection = useCallback(
    async (
      sectionId: TvLiveSectionId,
      channel: TVChannel,
      channelIds: string[]
    ) => {
      setOpeningChannelId(channel.id);

      await openTvChannelPlayer(channel, {
        sectionId,
        channelIds,
        matureEnabled,
      });

      if (mountedRef.current) {
        setOpeningChannelId((current) =>
          current === channel.id ? null : current
        );
      }
    },
    [matureEnabled, mountedRef]
  );

  const handleRemoveHistory = useCallback(
    async (channel: TVChannel) => {
      const previous = recentEntries;
      const next = previous.filter((entry) => entry.channelId !== channel.id);
      applyRecentEntries(next);
      try {
        await removeTvRecentlyWatched(channel.id);
      } catch {
        if (mountedRef.current) applyRecentEntries(previous);
      }
    },
    [applyRecentEntries, mountedRef, recentEntries]
  );

  const handleClearHistory = useCallback(() => {
    Alert.alert(
      "Clear watch history?",
      "This removes all Previously Watched channels from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            const previous = recentEntries;
            applyRecentEntries([]);
            void clearTvRecentlyWatched().catch(() => {
              if (mountedRef.current) applyRecentEntries(previous);
            });
          },
        },
      ]
    );
  }, [applyRecentEntries, mountedRef, recentEntries]);

  const loadMoreForSection = useCallback(
    async (sectionId: TvLiveSectionId) => {
      if (loadingMoreSection) return;

      setLoadingMoreSection(sectionId);
      const current = sectionChannelsRef.current[sectionId] || [];
      const result = getTvChannelsForSection(sectionId, matureEnabled, {
        offset: current.length,
        limit: TV_CHANNEL_PAGE_SIZE,
      });

      if (!mountedRef.current) return;

      setSectionChannels((prev) => {
        const next = {
          ...prev,
          [sectionId]: [...current, ...result.channels],
        };
        sectionChannelsRef.current = next;
        return next;
      });
      setSectionHasMore((prev) => ({
        ...prev,
        [sectionId]: result.hasMore,
      }));
      setLoadingMoreSection(null);
    },
    [loadingMoreSection, matureEnabled, mountedRef]
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
      {continueChannels.length ? (
        <TvChannelRail
          title="Continue Watching"
          channels={continueChannels}
          countLabel={`${continueChannels.length}`}
          connectingChannelId={openingChannelId}
          progressByChannelId={progressByChannelId}
          onPressChannel={(channel) =>
            void openFromSection(
              "recent",
              channel,
              continueChannels.map((entry) => entry.id)
            )
          }
        />
      ) : null}

      {recentChannels.length ? (
        <TvChannelRail
          title="Previously Watched"
          channels={recentChannels}
          countLabel={`${recentChannels.length}`}
          connectingChannelId={openingChannelId}
          showRemove
          onRemoveChannel={(channel) => void handleRemoveHistory(channel)}
          headerAction={
            <TouchableOpacity
              onPress={handleClearHistory}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear watch history"
            >
              <Text style={styles.clearHistoryText}>Clear</Text>
            </TouchableOpacity>
          }
          onPressChannel={(channel) =>
            void openFromSection(
              "recent",
              channel,
              recentChannels.map((entry) => entry.id)
            )
          }
        />
      ) : null}

      {favoriteChannels.length ? (
        <TvChannelRail
          title="Favorite Channels"
          channels={favoriteChannels}
          countLabel={`${favoriteChannels.length}`}
          connectingChannelId={openingChannelId}
          onPressChannel={(channel) =>
            void openFromSection(
              "favorites",
              channel,
              favoriteChannels.map((entry) => entry.id)
            )
          }
        />
      ) : null}

      {LIVE_TV_HOME_SECTIONS.map((section) => {
        const channels = sectionChannels[section.id] || [];
        if (!channels.length) return null;

        const channelIds = channels.map((channel) => channel.id);

        return (
          <View key={section.id}>
            <TvChannelRail
              title={section.title}
              channels={channels}
              connectingChannelId={openingChannelId}
              onPressChannel={(channel) =>
                void openFromSection(section.id, channel, channelIds)
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

      {recommendedChannels.length ? (
        <TvChannelRail
          title="Recommended"
          channels={recommendedChannels}
          connectingChannelId={openingChannelId}
          onPressChannel={(channel) =>
            void openFromSection(
              "recommended",
              channel,
              recommendedChannels.map((entry) => entry.id)
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
          connectingChannelId={openingChannelId}
          onPressChannel={(channel) =>
            void openFromSection(
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

  clearHistoryText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
});
