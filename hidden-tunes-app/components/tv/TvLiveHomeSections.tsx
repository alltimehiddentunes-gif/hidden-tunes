import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import TvChannelRail from "@/components/tv/TvChannelRail";
import { COLORS } from "@/constants/theme";
import { getTvChannelById } from "@/data/tvChannelSeedCatalog";
import {
  isMatureTvEnabled,
  setMatureTvEnabled,
} from "@/services/matureTvPreferences";
import {
  LIVE_TV_HOME_SECTIONS,
  TV_CHANNEL_PAGE_SIZE,
  getMatureTvChannels,
  getRecommendedTvChannels,
  getTvChannelsForSection,
} from "@/services/tv/tvChannelService";
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
  const [sectionChannels, setSectionChannels] = useState<
    Record<string, TVChannel[]>
  >({});
  const [sectionHasMore, setSectionHasMore] = useState<Record<string, boolean>>(
    {}
  );
  const [loadingMoreSection, setLoadingMoreSection] = useState<string | null>(
    null
  );

  const recommendedChannels = useMemo(
    () => getRecommendedTvChannels(matureEnabled, 16),
    [matureEnabled]
  );

  const matureChannels = useMemo(
    () => getMatureTvChannels(matureEnabled),
    [matureEnabled]
  );

  const hydrateSections = useCallback(async () => {
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
    setLoading(false);

    const [recent, favorites] = await Promise.all([
      loadTvRecentlyWatched(),
      loadTvFavorites(),
    ]);

    if (!mountedRef.current) return;

    setRecentChannels(
      recent
        .map((entry) => getTvChannelById(entry.channelId))
        .filter((channel): channel is TVChannel => channel !== null)
        .slice(0, 16)
    );
    setFavoriteChannels(
      favorites
        .map((entry) => getTvChannelById(entry.channelId))
        .filter((channel): channel is TVChannel => channel !== null)
        .slice(0, 16)
    );
  }, [matureEnabled, mountedRef]);

  useEffect(() => {
    void hydrateSections();
  }, [hydrateSections]);

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

  const handleMatureToggle = useCallback(
    async (next: boolean) => {
      onMatureEnabledChange(next);
      await setMatureTvEnabled(next);
    },
    [onMatureEnabledChange]
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

      <View style={styles.matureSection}>
        <View style={styles.matureHeader}>
          <Ionicons name="lock-closed" size={18} color={COLORS.textMuted} />
          <View style={styles.matureCopy}>
            <Text style={styles.matureTitle}>Mature TV</Text>
            <Text style={styles.matureSub}>
              Off by default. Requires 18+ consent. Licensed sources only.
            </Text>
          </View>
          <Switch
            value={matureEnabled}
            onValueChange={(value) => void handleMatureToggle(value)}
          />
        </View>

        {!matureEnabled ? (
          <Text style={styles.matureLocked}>
            Enable mature content to unlock this section.
          </Text>
        ) : matureChannels.length ? (
          <TvChannelRail
            title="Mature TV"
            channels={matureChannels}
            onPressChannel={(channel) =>
              openFromSection(
                "mature",
                channel,
                matureChannels.map((entry) => entry.id)
              )
            }
          />
        ) : (
          <Text style={styles.matureLocked}>
            Mature channels are being prepared.
          </Text>
        )}
      </View>
    </View>
  );
}

export default memo(TvLiveHomeSections);

export async function preloadMatureTvPreference() {
  return isMatureTvEnabled();
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

  matureSection: {
    marginTop: 4,
    marginBottom: 18,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  matureHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  matureCopy: {
    flex: 1,
  },

  matureTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },

  matureSub: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    marginTop: 2,
  },

  matureLocked: {
    color: COLORS.textDim,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 12,
  },
});
