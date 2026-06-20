import React, { memo } from "react";
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import { TESTER_COPY } from "../../constants/testerExperience";
import { COLORS, GRADIENTS } from "../../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "../../context/PlayerContext";
import type { HiddenTunesNormalizedSong } from "../../services/hiddenTunesApi";
import type { SmartDiscoverySection } from "../../services/smartDiscovery";
import { FALLBACK_ARTWORK, getArtworkUri } from "../../utils/artwork";
import {
  shouldShowCatalogEmpty,
} from "../../utils/catalogEmptyStateTiming";
import HTImage from "../HTImage";
import { SubtleTvEntryLink, EmotionalDiscoveryChips } from "../EmotionalDiscoveryChips";

export type ExploreMountStage = 0 | 1 | 2 | 3 | 4;

type MoodRoomItem = {
  id: string;
  title: string;
  subtitle: string;
  artwork?: string[];
  gradient: readonly [string, string, ...string[]];
};

type GenreWorld = {
  id: string;
  title: string;
  subtitle: string;
  songs: HiddenTunesNormalizedSong[];
  artwork: string[];
  worldId?: string;
  gradient?: readonly [string, string, ...string[]];
};

type GenreHubItem = {
  id: string;
  title: string;
  subtitle: string;
  genreTitle: string;
  songs: HiddenTunesNormalizedSong[];
  artwork: string[];
};

type MoodCollectionItem = {
  id: string;
  title: string;
  subtitle: string;
  worldId: string;
  songs: HiddenTunesNormalizedSong[];
  artwork: string[];
  gradient: readonly [string, string, ...string[]];
};

type GenreItem = {
  id: string;
  title: string;
  query?: string;
};

type HorizontalTuning = {
  initialNumToRender: number;
  maxToRenderPerBatch: number;
  windowSize: number;
  updateCellsBatchingPeriod: number;
  removeClippedSubviews: boolean;
};

export type ExploreListHeaderProps = {
  mountStage: ExploreMountStage;
  loading: boolean;
  refreshing: boolean;
  cloudSongsCount: number;
  hasCheckedDiscoveryFallbacks: boolean;
  moodRooms: MoodRoomItem[];
  primaryMoodRoomId?: string;
  smartPicks: HiddenTunesNormalizedSong[];
  continueSongs: HiddenTunesNormalizedSong[];
  recentlyAdded: HiddenTunesNormalizedSong[];
  curatedSections: SmartDiscoverySection<HiddenTunesNormalizedSong>[];
  launchWorlds: GenreWorld[];
  genreHubs: GenreHubItem[];
  moodCollections: MoodCollectionItem[];
  genreWorlds: GenreWorld[];
  showHeavySections: boolean;
  playlists: any[];
  rankedAlbums: any[];
  rankedArtists: any[];
  horizontalRailTuning: HorizontalTuning;
  getCloudItemLayout: (
    data: any,
    index: number
  ) => { length: number; offset: number; index: number };
  onRefresh: () => void;
  cloudSongs: HiddenTunesNormalizedSong[];
  playSong: (
    song: HiddenTunesNormalizedSong,
    queue?: HiddenTunesNormalizedSong[],
    startIndex?: number
  ) => void | Promise<void>;
  onStartDiscovery: () => void;
  openGenre: (genre: GenreItem) => void;
  openMood: (title: string) => void;
  onOpenLaunchWorld: (worldId: string) => void;
  renderMoodRoom: ListRenderItem<MoodRoomItem>;
  renderSmartPick: ListRenderItem<HiddenTunesNormalizedSong>;
  renderRecentSong: ListRenderItem<HiddenTunesNormalizedSong>;
  renderCloudSong: ListRenderItem<HiddenTunesNormalizedSong>;
  renderPlaylistItem: ListRenderItem<any>;
  renderAlbumItem: ListRenderItem<any>;
  renderArtistItem: ListRenderItem<any>;
};

const EXPLORE_SKELETON_KEYS = ["one", "two", "three"];
const CARD_GAP = 14;
const ARTIST_CARD_WIDTH = 142;

function stageVisible(mountStage: ExploreMountStage, minStage: ExploreMountStage) {
  return mountStage >= minStage;
}

export const ExploreHeaderHero = memo(function ExploreHeaderHero({
  cloudSongsCount,
  onRefresh,
  onStartDiscovery,
}: {
  cloudSongsCount: number;
  onRefresh: () => void;
  onStartDiscovery: () => void;
}) {
  const { toggleSmartAutoplay } = usePlayerActions();
  const { smartAutoplayEnabled } = usePlayerState();

  return (
    <>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.kicker}>EXPLORE</Text>
          <Text style={styles.heading}>Hidden Tunes</Text>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={onRefresh}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.smartHero}>
        <View style={styles.smartHeroGlow} />

        <View style={styles.smartHeroTop}>
          <View style={styles.smartHeroIcon}>
            <Ionicons name="infinite" size={26} color={COLORS.primary} />
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.smartHeroToggle,
              smartAutoplayEnabled && styles.smartHeroToggleActive,
            ]}
            onPress={toggleSmartAutoplay}
          >
            <Text
              style={[
                styles.smartHeroToggleText,
                smartAutoplayEnabled && styles.smartHeroToggleTextActive,
              ]}
            >
              Smart {smartAutoplayEnabled ? "On" : "Off"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.smartHeroTitle}>Enter a listening room</Text>

        <View style={styles.smartHeroActions}>
          <TouchableOpacity
            activeOpacity={0.86}
            style={[
              styles.smartHeroPrimary,
              !cloudSongsCount && styles.disabledButton,
            ]}
            onPress={onStartDiscovery}
            disabled={!cloudSongsCount}
          >
            <Ionicons name="play" size={17} color="#000" />
            <Text style={styles.smartHeroPrimaryText}>Start Discovery</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.86}
            style={styles.smartHeroSecondary}
            onPress={() => router.push("/playlists" as any)}
          >
            <Ionicons name="albums" size={18} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
});

export const ExplorePrimaryRail = memo(function ExplorePrimaryRail({
  loading,
  cloudSongsCount,
  moodRooms,
  renderMoodRoom,
}: {
  loading: boolean;
  cloudSongsCount: number;
  moodRooms: MoodRoomItem[];
  renderMoodRoom: ListRenderItem<MoodRoomItem>;
}) {
  return (
    <>
      {moodRooms.length > 0 ? (
        <View style={styles.moodRailSection}>
          <Text style={styles.sectionTitleBlock}>Mood Rooms</Text>
          <FlatList
            horizontal
            data={moodRooms}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.moodRail}
            renderItem={renderMoodRoom}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews
          />
        </View>
      ) : null}

      {loading ? <ExploreSkeletonRail /> : null}

      {!loading && cloudSongsCount > 0 ? (
        <View style={styles.catalogStats}>
          <Ionicons name="cloud-done" size={16} color={COLORS.primary} />
          <Text style={styles.catalogStatsText}>{cloudSongsCount} songs ready</Text>
        </View>
      ) : null}
    </>
  );
});

export const ExploreContinueListening = memo(function ExploreContinueListening({
  cloudSongs,
  playSong,
}: {
  cloudSongs: HiddenTunesNormalizedSong[];
  playSong: (
    song: HiddenTunesNormalizedSong,
    queue?: HiddenTunesNormalizedSong[],
    startIndex?: number
  ) => void | Promise<void>;
}) {
  const { currentSong } = usePlayerNowPlaying();

  if (!currentSong) return null;

  const handleResume = () => {
    const artwork = getArtworkUri(currentSong, FALLBACK_ARTWORK);
    const streamUrl = String(
      currentSong.streamUrl ||
        currentSong.url ||
        currentSong.audioUrl ||
        currentSong.audio_url ||
        ""
    );
    const normalized = {
      ...currentSong,
      id: String(currentSong.id || currentSong.title || "song"),
      title: String(currentSong.title || "Unknown Song"),
      artist: String(
        currentSong.artist || currentSong.user?.name || "Hidden Tunes"
      ),
      artwork,
      cover: artwork,
      url: String(currentSong.url || streamUrl),
      streamUrl,
    } as HiddenTunesNormalizedSong;
    const startIndex = Math.max(
      0,
      cloudSongs.findIndex((item) => item.id === normalized.id)
    );
    void playSong(normalized as any, cloudSongs as any, startIndex);
    requestAnimationFrame(() => {
      router.push("/player" as any);
    });
  };

  return (
    <>
      <View style={styles.rowHeader}>
        <Text style={styles.sectionTitle}>Continue Listening</Text>
        <TouchableOpacity onPress={() => router.push("/player" as any)}>
          <Text style={styles.seeAll}>Player</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.88}
        style={styles.continueCard}
        onPress={handleResume}
      >
        <HTImage source={currentSong} style={styles.continueImage} />

        <View style={styles.continueInfo}>
          <Text style={styles.continueKicker}>NOW PLAYING</Text>
          <Text numberOfLines={1} style={styles.continueTitle}>
            {currentSong.title || "Unknown Song"}
          </Text>
          <Text numberOfLines={1} style={styles.continueArtist}>
            {currentSong.artist ||
              currentSong.user?.name ||
              currentSong.channelTitle ||
              "Hidden Tunes"}
          </Text>
        </View>

        <View style={styles.continuePlay}>
          <Ionicons name="play" size={18} color="#000" />
        </View>
      </TouchableOpacity>
    </>
  );
});

export const ExploreDiscoveryRails = memo(function ExploreDiscoveryRails({
  smartPicks,
  continueSongs,
  recentlyAdded,
  horizontalRailTuning,
  getCloudItemLayout,
  renderSmartPick,
  renderRecentSong,
  renderCloudSong,
}: {
  smartPicks: HiddenTunesNormalizedSong[];
  continueSongs: HiddenTunesNormalizedSong[];
  recentlyAdded: HiddenTunesNormalizedSong[];
  horizontalRailTuning: HorizontalTuning;
  getCloudItemLayout: ExploreListHeaderProps["getCloudItemLayout"];
  renderSmartPick: ListRenderItem<HiddenTunesNormalizedSong>;
  renderRecentSong: ListRenderItem<HiddenTunesNormalizedSong>;
  renderCloudSong: ListRenderItem<HiddenTunesNormalizedSong>;
}) {
  return (
    <>
      {smartPicks.length > 0 ? (
        <>
          <View style={styles.rowHeader}>
            <Text style={styles.sectionTitle}>Because You Listened</Text>
            <TouchableOpacity onPress={() => router.push("/queue" as any)}>
              <Text style={styles.seeAll}>Queue</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            horizontal
            data={smartPicks}
            keyExtractor={(item) => `smart-${item.id}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cloudRow}
            renderItem={renderSmartPick}
            getItemLayout={getCloudItemLayout}
            initialNumToRender={horizontalRailTuning.initialNumToRender}
            maxToRenderPerBatch={horizontalRailTuning.maxToRenderPerBatch}
            windowSize={horizontalRailTuning.windowSize}
            updateCellsBatchingPeriod={horizontalRailTuning.updateCellsBatchingPeriod}
            removeClippedSubviews
          />
        </>
      ) : null}

      {continueSongs.length > 0 ? (
        <>
          <View style={styles.rowHeader}>
            <Text style={styles.sectionTitle}>Return To The Feeling</Text>
            <TouchableOpacity onPress={() => router.push("/recently-played" as any)}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            horizontal
            data={continueSongs}
            keyExtractor={(item) => `recent-${item.id}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cloudRow}
            renderItem={renderRecentSong}
            getItemLayout={getCloudItemLayout}
            initialNumToRender={horizontalRailTuning.initialNumToRender}
            maxToRenderPerBatch={horizontalRailTuning.maxToRenderPerBatch}
            windowSize={horizontalRailTuning.windowSize}
            updateCellsBatchingPeriod={horizontalRailTuning.updateCellsBatchingPeriod}
            removeClippedSubviews
          />
        </>
      ) : null}

      {recentlyAdded.length > 0 ? (
        <>
          <View style={styles.rowHeader}>
            <Text style={styles.sectionTitle}>Recently Added</Text>
          </View>
          <FlatList
            horizontal
            data={recentlyAdded}
            keyExtractor={(item) => `recently-added-${item.id}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cloudRow}
            renderItem={renderCloudSong}
            getItemLayout={getCloudItemLayout}
            initialNumToRender={horizontalRailTuning.initialNumToRender}
            maxToRenderPerBatch={horizontalRailTuning.maxToRenderPerBatch}
            windowSize={horizontalRailTuning.windowSize}
            updateCellsBatchingPeriod={horizontalRailTuning.updateCellsBatchingPeriod}
            removeClippedSubviews
          />
        </>
      ) : null}
    </>
  );
});

export const ExploreCuratedSections = memo(function ExploreCuratedSections({
  curatedSections,
  horizontalRailTuning,
  getCloudItemLayout,
  renderCloudSong,
  openGenre,
}: {
  curatedSections: SmartDiscoverySection<HiddenTunesNormalizedSong>[];
  horizontalRailTuning: HorizontalTuning;
  getCloudItemLayout: ExploreListHeaderProps["getCloudItemLayout"];
  renderCloudSong: ListRenderItem<HiddenTunesNormalizedSong>;
  openGenre: (genre: GenreItem) => void;
}) {
  return (
    <>
      {curatedSections.map((section) => (
        <View key={`explore-curated-${section.id}`}>
          <View style={styles.rowHeader}>
            <View style={styles.sectionHeadingStack}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
            </View>
            {section.genreTitle ? (
              <TouchableOpacity
                onPress={() =>
                  openGenre({
                    id: section.genreTitle || section.id,
                    title: section.genreTitle || section.title,
                    query: section.genreTitle || section.title,
                  })
                }
              >
                <Text style={styles.seeAll}>Open room</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <FlatList
            horizontal
            data={section.songs}
            keyExtractor={(item) => `curated-${section.id}-${item.id}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cloudRow}
            renderItem={renderCloudSong}
            getItemLayout={getCloudItemLayout}
            initialNumToRender={horizontalRailTuning.initialNumToRender}
            maxToRenderPerBatch={horizontalRailTuning.maxToRenderPerBatch}
            windowSize={horizontalRailTuning.windowSize}
            updateCellsBatchingPeriod={horizontalRailTuning.updateCellsBatchingPeriod}
            removeClippedSubviews
          />
        </View>
      ))}
    </>
  );
});

export const ExploreLaunchWorldsGrid = memo(function ExploreLaunchWorldsGrid({
  launchWorlds,
  onOpenLaunchWorld,
}: {
  launchWorlds: GenreWorld[];
  onOpenLaunchWorld: (worldId: string) => void;
}) {
  return (
    <>
      <Text style={styles.sectionTitleBlock}>Emotional Worlds</Text>
      {launchWorlds.length > 0 ? (
        <View style={styles.genreGrid}>
          {launchWorlds.map((world, index) => {
            const primaryArtwork = world.artwork[0] || "";
            const worldId = world.worldId || world.id.replace(/^world-/, "");

            return (
              <TouchableOpacity
                key={world.id}
                activeOpacity={0.86}
                style={[
                  styles.genreWorldCard,
                  index % 2 === 1 && styles.genreWorldCardAlt,
                ]}
                onPress={() => onOpenLaunchWorld(worldId)}
              >
                <View style={styles.genreWorldGlow} />
                <View style={styles.genreAccentLine} />
                <View style={styles.genreArtworkStack}>
                  {primaryArtwork ? (
                    <HTImage uri={primaryArtwork} style={styles.genreArtwork} />
                  ) : (
                    <LinearGradient
                      colors={world.gradient || GRADIENTS.card}
                      style={[styles.genreArtwork, styles.genreArtworkFallback]}
                    >
                      <Ionicons name="sparkles" size={28} color={COLORS.textMuted} />
                    </LinearGradient>
                  )}
                </View>
                <View style={styles.genreWorldTop}>
                  <View style={styles.genreIndexBadge}>
                    <Text style={styles.genreIndexText}>
                      {String(index + 1).padStart(2, "0")}
                    </Text>
                  </View>
                  <View style={styles.genreVibePill}>
                    <Text numberOfLines={1} style={styles.genreVibeText}>
                      {world.songs.length} songs
                    </Text>
                  </View>
                </View>
                <View style={styles.genreWorldContent}>
                  <Text numberOfLines={1} style={styles.genreTitle}>
                    {world.title}
                  </Text>
                  <Text numberOfLines={2} style={styles.genreWorldSubtitle}>
                    {world.subtitle}
                  </Text>
                </View>
                <View style={styles.genreCtaRow}>
                  <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.sectionEmpty}>
          <Text style={styles.sectionEmptyText}>
            Emotional worlds are loading from your Hidden Tunes catalog.
          </Text>
        </View>
      )}
    </>
  );
});

export const ExploreGenreHubRow = memo(function ExploreGenreHubRow({
  genreHubs,
  openGenre,
}: {
  genreHubs: GenreHubItem[];
  openGenre: (genre: GenreItem) => void;
}) {
  if (!genreHubs.length) return null;

  return (
    <View style={styles.genreHubSection}>
      <Text style={styles.sectionTitleBlock}>Genre Hubs</Text>
      <View style={styles.genreHubChipWrap}>
        {genreHubs.map((hub) => (
          <TouchableOpacity
            key={hub.id}
            activeOpacity={0.86}
            style={styles.genreHubChip}
            onPress={() =>
              openGenre({
                id: hub.genreTitle,
                title: hub.genreTitle,
                query: hub.genreTitle,
              })
            }
          >
            <Text style={styles.genreHubChipText}>{hub.title}</Text>
            <Text style={styles.genreHubChipMeta}>{hub.songs.length}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
});

export const ExploreMoodCollectionsRail = memo(function ExploreMoodCollectionsRail({
  moodCollections,
  onOpenLaunchWorld,
}: {
  moodCollections: MoodCollectionItem[];
  onOpenLaunchWorld: (worldId: string) => void;
}) {
  if (!moodCollections.length) return null;

  return (
    <View style={styles.moodRailSection}>
      <Text style={styles.sectionTitleBlock}>Mood Collections</Text>
      <FlatList
        horizontal
        data={moodCollections}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.moodRail}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.moodCollectionCard}
            onPress={() => onOpenLaunchWorld(item.worldId)}
          >
            {item.artwork[0] ? (
              <HTImage uri={item.artwork[0]} style={styles.moodCollectionArt} />
            ) : (
              <LinearGradient
                colors={item.gradient}
                style={styles.moodCollectionArt}
              >
                <Ionicons name="musical-notes" size={22} color={COLORS.textMuted} />
              </LinearGradient>
            )}
            <View style={styles.moodCollectionCopy}>
              <Text numberOfLines={1} style={styles.moodCollectionTitle}>
                {item.title}
              </Text>
              <Text numberOfLines={2} style={styles.moodCollectionSubtitle}>
                {item.subtitle}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
});

/** @deprecated Use ExploreLaunchWorldsGrid */
export const ExploreGenreGrid = memo(function ExploreGenreGrid({
  genreWorlds,
  openGenre,
}: {
  genreWorlds: GenreWorld[];
  openGenre: (genre: GenreItem) => void;
}) {
  return (
    <>
      <Text style={styles.sectionTitleBlock}>Genre Spotlights</Text>
      {genreWorlds.length > 0 ? (
        <View style={styles.genreGrid}>
          {genreWorlds.map((genre, index) => {
            const primaryArtwork = genre.artwork[0] || "";

            return (
              <TouchableOpacity
                key={genre.id}
                activeOpacity={0.86}
                style={[
                  styles.genreWorldCard,
                  index % 2 === 1 && styles.genreWorldCardAlt,
                ]}
                onPress={() =>
                  openGenre({
                    id: genre.title,
                    title: genre.title,
                    query: genre.title,
                  })
                }
              >
                <View style={styles.genreWorldGlow} />
                <View style={styles.genreAccentLine} />
                <View style={styles.genreArtworkStack}>
                  {primaryArtwork ? (
                    <HTImage uri={primaryArtwork} style={styles.genreArtwork} />
                  ) : (
                    <LinearGradient
                      colors={GRADIENTS.card}
                      style={[styles.genreArtwork, styles.genreArtworkFallback]}
                    >
                      <Ionicons name="musical-notes" size={28} color={COLORS.textMuted} />
                    </LinearGradient>
                  )}
                </View>
                <View style={styles.genreWorldTop}>
                  <View style={styles.genreIndexBadge}>
                    <Text style={styles.genreIndexText}>
                      {String(index + 1).padStart(2, "0")}
                    </Text>
                  </View>
                  <View style={styles.genreVibePill}>
                    <Text numberOfLines={1} style={styles.genreVibeText}>
                      {genre.songs.length} songs
                    </Text>
                  </View>
                </View>
                <View style={styles.genreWorldContent}>
                  <Text numberOfLines={1} style={styles.genreTitle}>
                    {genre.title}
                  </Text>
                </View>
                <View style={styles.genreCtaRow}>
                  <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.sectionEmpty}>
          <Text style={styles.sectionEmptyText}>
            Genre rooms are still loading from your catalog.
          </Text>
        </View>
      )}
    </>
  );
});

export const ExploreHeavySections = memo(function ExploreHeavySections({
  showHeavySections,
  playlists,
  rankedAlbums,
  rankedArtists,
  horizontalRailTuning,
  renderPlaylistItem,
  renderAlbumItem,
  renderArtistItem,
  loading,
  hasCheckedDiscoveryFallbacks,
  cloudSongsCount,
  refreshing,
}: {
  showHeavySections: boolean;
  playlists: any[];
  rankedAlbums: any[];
  rankedArtists: any[];
  horizontalRailTuning: HorizontalTuning;
  renderPlaylistItem: ListRenderItem<any>;
  renderAlbumItem: ListRenderItem<any>;
  renderArtistItem: ListRenderItem<any>;
  loading: boolean;
  hasCheckedDiscoveryFallbacks: boolean;
  cloudSongsCount: number;
  refreshing: boolean;
}) {
  return (
    <>
      {showHeavySections && playlists.length > 0 ? (
        <>
          <View style={styles.rowHeader}>
            <Text style={styles.sectionTitle}>Listening Rooms</Text>
            <TouchableOpacity onPress={() => router.push("/cloud-playlists" as any)}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            horizontal
            data={playlists}
            keyExtractor={(item: any) => `playlist-${item.id}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cloudRow}
            initialNumToRender={horizontalRailTuning.initialNumToRender}
            maxToRenderPerBatch={horizontalRailTuning.maxToRenderPerBatch}
            windowSize={horizontalRailTuning.windowSize}
            updateCellsBatchingPeriod={horizontalRailTuning.updateCellsBatchingPeriod}
            removeClippedSubviews
            renderItem={renderPlaylistItem}
          />
        </>
      ) : null}

      {showHeavySections && rankedAlbums.length > 0 ? (
        <>
          <Text style={styles.sectionTitleBlock}>Deep Cuts & Albums</Text>
          <FlatList
            horizontal
            data={rankedAlbums}
            keyExtractor={(item: any) => `album-${item.id}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cloudRow}
            initialNumToRender={horizontalRailTuning.initialNumToRender}
            maxToRenderPerBatch={horizontalRailTuning.maxToRenderPerBatch}
            windowSize={horizontalRailTuning.windowSize}
            updateCellsBatchingPeriod={horizontalRailTuning.updateCellsBatchingPeriod}
            removeClippedSubviews
            renderItem={renderAlbumItem}
          />
        </>
      ) : null}

      {showHeavySections && rankedArtists.length > 0 ? (
        <>
          <Text style={styles.sectionTitleBlock}>Creators To Follow</Text>
          <FlatList
            horizontal
            data={rankedArtists}
            keyExtractor={(item: any) => `artist-${item.id}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cloudRow}
            initialNumToRender={horizontalRailTuning.initialNumToRender}
            maxToRenderPerBatch={horizontalRailTuning.maxToRenderPerBatch}
            windowSize={horizontalRailTuning.windowSize}
            updateCellsBatchingPeriod={horizontalRailTuning.updateCellsBatchingPeriod}
            removeClippedSubviews
            getItemLayout={(_, index) => ({
              length: ARTIST_CARD_WIDTH + CARD_GAP,
              offset: (ARTIST_CARD_WIDTH + CARD_GAP) * index,
              index,
            })}
            renderItem={renderArtistItem}
          />
        </>
      ) : null}

      {shouldShowCatalogEmpty({
        hasCheckedFallbacks: hasCheckedDiscoveryFallbacks,
        isLoading: loading,
        isRefreshing: refreshing,
        resolvedCount: cloudSongsCount,
      }) ? (
        <View style={styles.empty}>
          <Ionicons name="musical-notes-outline" size={58} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Discovery is warming up</Text>
          <Text style={styles.emptyText}>{TESTER_COPY.catalogWarming}</Text>
        </View>
      ) : null}

      <SubtleTvEntryLink style={styles.exploreTvEntry} />
    </>
  );
});

function ExploreSkeletonRail() {
  return (
    <View style={styles.skeletonPanel}>
      <View style={styles.skeletonTitleRow}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.loadingText}>Preparing discovery...</Text>
      </View>
      <View style={styles.skeletonRail}>
        {EXPLORE_SKELETON_KEYS.map((item) => (
          <View key={`explore-skeleton-${item}`} style={styles.skeletonCard}>
            <View style={styles.skeletonArtwork} />
            <View style={styles.skeletonLineLarge} />
            <View style={styles.skeletonLineSmall} />
          </View>
        ))}
      </View>
    </View>
  );
}

const ExploreListHeader = memo(function ExploreListHeader(
  props: ExploreListHeaderProps
) {
  if (props.mountStage < 1) return null;

  return (
    <>
      {stageVisible(props.mountStage, 1) ? (
        <ExploreHeaderHero
          cloudSongsCount={props.cloudSongsCount}
          onRefresh={props.onRefresh}
          onStartDiscovery={props.onStartDiscovery}
        />
      ) : null}

      {stageVisible(props.mountStage, 2) ? (
        <>
          <EmotionalDiscoveryChips style={styles.emotionalWorldsChips} />
          <ExploreContinueListening
            cloudSongs={props.cloudSongs}
            playSong={props.playSong}
          />
        </>
      ) : null}

      {stageVisible(props.mountStage, 1) ? (
        <ExplorePrimaryRail
          loading={props.loading}
          cloudSongsCount={props.cloudSongsCount}
          moodRooms={props.moodRooms}
          renderMoodRoom={props.renderMoodRoom}
        />
      ) : null}

      {stageVisible(props.mountStage, 2) ? (
        <ExploreDiscoveryRails
          smartPicks={props.smartPicks}
          continueSongs={props.continueSongs}
          recentlyAdded={props.recentlyAdded}
          horizontalRailTuning={props.horizontalRailTuning}
          getCloudItemLayout={props.getCloudItemLayout}
          renderSmartPick={props.renderSmartPick}
          renderRecentSong={props.renderRecentSong}
          renderCloudSong={props.renderCloudSong}
        />
      ) : null}

      {stageVisible(props.mountStage, 3) ? (
        <ExploreCuratedSections
          curatedSections={props.curatedSections}
          horizontalRailTuning={props.horizontalRailTuning}
          getCloudItemLayout={props.getCloudItemLayout}
          renderCloudSong={props.renderCloudSong}
          openGenre={props.openGenre}
        />
      ) : null}

      {stageVisible(props.mountStage, 3) ? (
        <>
          <ExploreMoodCollectionsRail
            moodCollections={props.moodCollections}
            onOpenLaunchWorld={props.onOpenLaunchWorld}
          />
          <ExploreGenreHubRow genreHubs={props.genreHubs} openGenre={props.openGenre} />
          <ExploreLaunchWorldsGrid
            launchWorlds={props.launchWorlds}
            onOpenLaunchWorld={props.onOpenLaunchWorld}
          />
        </>
      ) : null}

      {stageVisible(props.mountStage, 4) ? (
        <ExploreHeavySections
          showHeavySections={props.showHeavySections}
          playlists={props.playlists}
          rankedAlbums={props.rankedAlbums}
          rankedArtists={props.rankedArtists}
          horizontalRailTuning={props.horizontalRailTuning}
          renderPlaylistItem={props.renderPlaylistItem}
          renderAlbumItem={props.renderAlbumItem}
          renderArtistItem={props.renderArtistItem}
          loading={props.loading}
          hasCheckedDiscoveryFallbacks={props.hasCheckedDiscoveryFallbacks}
          cloudSongsCount={props.cloudSongsCount}
          refreshing={props.refreshing}
        />
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  heading: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: "900",
    marginTop: 4,
  },
  refreshButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border || "rgba(255,255,255,0.12)",
  },
  smartHero: {
    marginTop: 28,
    borderRadius: 34,
    padding: 24,
    minHeight: 196,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  smartHeroGlow: {
    position: "absolute",
    top: -80,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(168,85,247,0.2)",
  },
  smartHeroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  smartHeroIcon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  smartHeroToggle: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  smartHeroToggleActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  smartHeroToggleText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "900",
  },
  smartHeroToggleTextActive: {
    color: "#000",
  },
  smartHeroTitle: {
    color: COLORS.text,
    fontSize: 27,
    fontWeight: "900",
    lineHeight: 32,
    marginTop: 20,
    letterSpacing: -0.7,
  },
  smartHeroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  smartHeroPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  disabledButton: {
    opacity: 0.45,
  },
  smartHeroPrimaryText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 13,
  },
  smartHeroSecondary: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  moodRail: { gap: 12, paddingBottom: 10, paddingRight: 4 },
  moodRailSection: { marginTop: 10, marginBottom: 12 },
  catalogStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    marginBottom: 22,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  catalogStatsText: { color: COLORS.text, fontSize: 12, fontWeight: "800" },
  rowHeader: {
    marginTop: 36,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: { color: COLORS.text, fontSize: 22, fontWeight: "900" },
  sectionTitleBlock: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 8,
    marginBottom: 18,
  },
  sectionHeadingStack: { flex: 1, paddingRight: 12 },
  sectionSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },
  sectionEmpty: { paddingHorizontal: 4, paddingBottom: 18 },
  sectionEmptyText: { color: COLORS.textMuted, fontSize: 13 },
  seeAll: { color: COLORS.primary, fontSize: 13, fontWeight: "900" },
  continueCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.075)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 24,
  },
  continueImage: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: COLORS.card,
  },
  continueInfo: { flex: 1, marginLeft: 14 },
  continueKicker: {
    color: COLORS.primary,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "900",
    marginBottom: 6,
  },
  continueTitle: { color: COLORS.text, fontSize: 17, fontWeight: "900" },
  continueArtist: { color: COLORS.textMuted, fontSize: 13, marginTop: 5 },
  continuePlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  cloudRow: { gap: CARD_GAP, paddingBottom: 32, paddingRight: 20 },
  genreGrid: { gap: 14, marginBottom: 28 },
  genreWorldCard: {
    width: "100%",
    minHeight: 184,
    borderRadius: 32,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.058)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    justifyContent: "space-between",
    overflow: "hidden",
  },
  genreWorldCardAlt: { borderColor: "rgba(34,211,238,0.13)" },
  genreWorldGlow: {
    position: "absolute",
    right: -74,
    top: -76,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(168,85,247,0.14)",
  },
  genreAccentLine: {
    position: "absolute",
    left: 0,
    top: 24,
    bottom: 24,
    width: 2,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
    opacity: 0.72,
  },
  genreWorldTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 2,
  },
  genreArtworkStack: {
    position: "absolute",
    right: 18,
    top: 34,
    width: 126,
    height: 116,
  },
  genreArtwork: {
    position: "absolute",
    right: 0,
    top: 8,
    width: 92,
    height: 92,
    borderRadius: 28,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  genreArtworkFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  genreArtworkMid: {
    right: 20,
    top: 4,
    opacity: 0.62,
    transform: [{ rotate: "-7deg" }],
  },
  genreArtworkBack: {
    right: 40,
    top: 0,
    opacity: 0.28,
    transform: [{ rotate: "-13deg" }],
  },
  genreIndexBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.36)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  genreIndexText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  genreVibePill: {
    maxWidth: 150,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  genreVibeText: {
    color: COLORS.text,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  genreWorldContent: { marginTop: 40, paddingRight: 118, zIndex: 2 },
  genreTitle: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  genreWorldSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 6,
    fontWeight: "600",
  },
  emotionalWorldsChips: {
    marginTop: 8,
    marginBottom: 8,
  },
  genreHubSection: {
    marginBottom: 8,
  },
  genreHubChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  genreHubChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  genreHubChipText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  genreHubChipMeta: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  moodCollectionCard: {
    width: 148,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  moodCollectionArt: {
    width: "100%",
    height: 108,
    alignItems: "center",
    justifyContent: "center",
  },
  moodCollectionCopy: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 2,
  },
  moodCollectionTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
  },
  moodCollectionSubtitle: {
    color: COLORS.textMuted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
  },
  genreCtaRow: { alignSelf: "flex-start", zIndex: 2 },
  skeletonPanel: {
    minHeight: 190,
    borderRadius: 28,
    padding: 16,
    marginBottom: 22,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  skeletonTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  skeletonRail: { flexDirection: "row", gap: 12 },
  skeletonCard: {
    flex: 1,
    minHeight: 126,
    borderRadius: 20,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  skeletonArtwork: {
    height: 70,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginBottom: 12,
  },
  skeletonLineLarge: {
    width: "82%",
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginBottom: 8,
  },
  skeletonLineSmall: {
    width: "58%",
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  loadingText: { color: COLORS.textMuted, marginLeft: 10, fontSize: 14 },
  exploreTvEntry: {
    marginTop: 12,
    marginBottom: 24,
  },
  tvLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
    paddingVertical: 8,
  },
  heroWrap: {
    height: 320,
    borderRadius: 34,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 30,
  },
  heroImage: { width: "100%", height: "100%", position: "absolute" },
  heroOverlay: { ...StyleSheet.flatten(StyleSheet.absoluteFill) },
  heroBadge: {
    position: "absolute",
    top: 18,
    left: 18,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  heroBadgeText: { color: COLORS.text, fontSize: 12, fontWeight: "900", marginLeft: 6 },
  heroContent: { position: "absolute", left: 18, right: 18, bottom: 18 },
  heroTitle: { color: COLORS.text, fontSize: 24, fontWeight: "900" },
  heroArtist: { color: COLORS.textMuted, fontSize: 13, marginTop: 6 },
  heroAction: {
    marginTop: 14,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  heroActionText: { color: "#000", fontWeight: "900", fontSize: 13 },
  empty: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 20 },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 16,
    textAlign: "center",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 10,
    textAlign: "center",
    lineHeight: 22,
  },
});

export default ExploreListHeader;
