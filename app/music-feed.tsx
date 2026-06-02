import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  useWindowDimensions,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import AppShell from "@/components/navigation/AppShell";
import { SubtleTvEntryLink } from "@/components/EmotionalDiscoveryChips";
import HTImage from "@/components/HTImage";
import LiveWaveform from "@/components/LiveWaveform";
import NeonEQ from "@/components/NeonEQ";
import UnifiedMediaCard from "@/components/UnifiedMediaCard";
import UniversalSearchGroupedResults from "@/components/UniversalSearchGroupedResults";
import { HomeCatalogSongRow, HomeFeaturedCard } from "@/components/catalog/HomePlaybackRows";
import DebouncedSearchInput from "@/components/search/DebouncedSearchInput";
import { COLORS, GRADIENTS } from "@/constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "@/context/PlayerContext";
import {
  fetchHiddenTunesCatalog,
  type HiddenTunesAlbumCatalogItem,
  type HiddenTunesArtistCatalogItem,
  type HiddenTunesDerivedCatalog,
  type HiddenTunesGenreCatalogItem,
  type HiddenTunesSong,
} from "@/services/hiddenTunes";
import type {
  HiddenTunesAlbum,
  HiddenTunesArtist,
  HiddenTunesNormalizedSong,
} from "@/services/hiddenTunesApi";
import {
  runInstantCatalogSearch,
  type InstantSearchCatalog,
} from "@/services/instantCatalogSearch";
import type { UniversalSearchGroupedResults as SearchGroupedResults } from "@/services/universalSearchService";
import type { HiddenTunesGenre } from "@/utils/genres";

const EMPTY_SEARCH_RESULTS: SearchGroupedResults = {
  topResults: [],
  songs: [],
  lyrics: [],
  artists: [],
  albums: [],
  genreMoods: [],
  tv: [],
  hasAnyResults: false,
};

type HeroCard = {
  key: string;
  label: string;
  title: string;
  subtitle: string;
  song: HiddenTunesNormalizedSong;
  icon: keyof typeof Ionicons.glyphMap;
  isCurrent?: boolean;
};

function toNormalizedSongs(songs: HiddenTunesSong[]) {
  return songs as unknown as HiddenTunesNormalizedSong[];
}

function toSearchAlbums(albums: HiddenTunesAlbumCatalogItem[]) {
  return albums.map((album) => ({
    id: album.id,
    title: album.title,
    slug: album.id,
    artist: album.artist,
    artwork: album.artwork,
    tracks: toNormalizedSongs(album.songs),
  })) as HiddenTunesAlbum[];
}

function toSearchArtists(artists: HiddenTunesArtistCatalogItem[]) {
  return artists.map((artist) => ({
    id: artist.id,
    name: artist.name,
    slug: artist.id,
    artwork: artist.artwork,
    cover: artist.artwork,
    thumbnail: artist.artwork,
    albums: toSearchAlbums(artist.albums),
    tracks: toNormalizedSongs(artist.songs),
  })) as HiddenTunesArtist[];
}

function toSearchGenres(genres: HiddenTunesGenreCatalogItem[]) {
  return genres.map((genre) => ({
    id: genre.id,
    title: genre.title,
    query: genre.title,
    emoji: "",
  })) as HiddenTunesGenre[];
}

function findSongIndex(songs: HiddenTunesSong[], song: { id?: string }) {
  const id = String(song?.id || "");
  return songs.findIndex((candidate) => String(candidate.id) === id);
}

function buildHeroCards(
  songs: HiddenTunesSong[],
  featuredSongs: HiddenTunesSong[],
  currentSong: { id?: string; title?: string; artist?: string; user?: { name?: string } } | null,
  recentlyPlayed: Array<{ id?: string; title?: string; artist?: string }>
): HeroCard[] {
  const cards: HeroCard[] = [];
  const primary = featuredSongs[0] || songs[0];
  const pick = featuredSongs[1] || featuredSongs[0];
  const genreSong = featuredSongs.find((song) => song.genre) || songs.find((song) => song.genre);
  const recent = recentlyPlayed[0];

  if (currentSong && primary) {
    const match =
      songs.find((song) => String(song.id) === String(currentSong.id)) ||
      (primary as HiddenTunesSong);

    cards.push({
      key: `current-${match.id}`,
      label: "NOW PLAYING",
      title: currentSong.title || match.title || "Now playing",
      subtitle:
        currentSong.artist ||
        currentSong.user?.name ||
        match.artist ||
        "Hidden Tunes",
      song: match as unknown as HiddenTunesNormalizedSong,
      icon: "pulse",
      isCurrent: true,
    });
  }

  if (primary) {
    cards.push({
      key: `featured-${primary.id}`,
      label: "FEATURED",
      title: primary.title,
      subtitle: primary.artist || "Hidden Tunes",
      song: primary as unknown as HiddenTunesNormalizedSong,
      icon: "sparkles",
    });
  }

  if (pick && String(pick.id) !== String(primary?.id)) {
    cards.push({
      key: `pick-${pick.id}`,
      label: "HIDDEN TUNES PICK",
      title: pick.title,
      subtitle: pick.artist || "Editor pick",
      song: pick as unknown as HiddenTunesNormalizedSong,
      icon: "cloud-done",
    });
  }

  if (genreSong) {
    cards.push({
      key: `genre-${genreSong.id}`,
      label: String(genreSong.genre || "GENRE").toUpperCase(),
      title: genreSong.title,
      subtitle: genreSong.artist || "Genre spotlight",
      song: genreSong as unknown as HiddenTunesNormalizedSong,
      icon: "albums",
    });
  }

  if (recent) {
    const recentSong =
      songs.find((song) => String(song.id) === String(recent.id)) || primary;

    if (recentSong) {
      cards.push({
        key: `recent-${recentSong.id}`,
        label: "RECENTLY PLAYED",
        title: recent.title || recentSong.title,
        subtitle: recent.artist || recentSong.artist || "Back in rotation",
        song: recentSong as unknown as HiddenTunesNormalizedSong,
        icon: "time",
      });
    }
  }

  const seen = new Set<string>();
  return cards.filter((card) => {
    if (seen.has(card.key)) return false;
    seen.add(card.key);
    return true;
  }).slice(0, 6);
}

export default function MusicFeedScreen() {
  const { playSong } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();
  const { recentlyPlayed } = usePlayerState();

  const [catalog, setCatalog] = useState<HiddenTunesDerivedCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState("");
  const [heroIndex, setHeroIndex] = useState(0);
  const heroIndexRef = useRef(0);
  const { width: viewportWidth } = useWindowDimensions();
  const heroCardWidth = Math.min(520, Math.max(300, viewportWidth - 36));
  const heroCardHeight = Math.min(320, Math.max(238, Math.round(heroCardWidth * 0.72)));
  const railCardWidth = Math.min(244, Math.max(204, viewportWidth * 0.62));
  const searchPanelPadding = viewportWidth < 380 ? 14 : 18;

  const songs = catalog?.songs || [];
  const artists = catalog?.artists || [];
  const albums = catalog?.albums || [];
  const genres = catalog?.genres || [];
  const playlists = catalog?.playlists || [];

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    const data = await fetchHiddenTunesCatalog();
    setCatalog(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const refreshCatalog = useCallback(async () => {
    setRefreshing(true);
    const data = await fetchHiddenTunesCatalog();
    setCatalog(data);
    setRefreshing(false);
  }, []);

  const visiblePlaylists = useMemo(() => playlists.slice(0, 6), [playlists]);
  const featuredSongs = useMemo(() => songs.slice(0, 8), [songs]);
  const moodGenreChips = useMemo(() => genres.slice(0, 4), [genres]);

  const heroCards = useMemo(
    () =>
      buildHeroCards(
        songs,
        featuredSongs,
        currentSong,
        Array.isArray(recentlyPlayed) ? recentlyPlayed : []
      ),
    [currentSong, featuredSongs, recentlyPlayed, songs]
  );

  const searchCatalog = useMemo<InstantSearchCatalog>(() => ({
    songs: toNormalizedSongs(songs),
    albums: toSearchAlbums(albums),
    artists: toSearchArtists(artists),
    genres: toSearchGenres(genres),
    tvVideos: [],
  }), [albums, artists, genres, songs]);

  const searchResults = useMemo(() => {
    const cleanQuery = submittedSearchQuery.trim();
    if (cleanQuery.length < 2) return EMPTY_SEARCH_RESULTS;
    return runInstantCatalogSearch(searchCatalog, cleanQuery);
  }, [searchCatalog, submittedSearchQuery]);

  const hasSearchText = searchQuery.trim().length > 0;
  const showSearchResults = submittedSearchQuery.trim().length >= 2;

  const playCatalogSong = useCallback(
    (song: HiddenTunesSong | HiddenTunesNormalizedSong) => {
      const index = findSongIndex(songs, song);
      const catalogSong = index >= 0 ? songs[index] : (song as HiddenTunesSong);
      void playSong(catalogSong, songs, Math.max(index, 0));
    },
    [playSong, songs]
  );

  const openArtist = useCallback((artist: HiddenTunesArtistCatalogItem | HiddenTunesArtist) => {
    router.push({ pathname: "/artist", params: { artist: artist.name } } as any);
  }, []);

  const openAlbum = useCallback((album: HiddenTunesAlbumCatalogItem | HiddenTunesAlbum) => {
    router.push({
      pathname: "/album",
      params: {
        album: album.title,
        artist: album.artist,
        thumbnail: album.artwork,
      },
    } as any);
  }, []);

  const openGenre = useCallback((genre: HiddenTunesGenreCatalogItem | HiddenTunesGenre) => {
    router.push({
      pathname: "/genre",
      params: { title: genre.title, query: genre.title, id: genre.id, type: "genre" },
    } as any);
  }, []);

  const openTv = useCallback((video: any) => {
    router.push({
      pathname: "/youtube-player",
      params: {
        videoId: video.source_id || video.id,
        title: video.title,
        channelTitle: video.channel_name || video.channelTitle || "Hidden Tunes TV",
        thumbnail: video.thumbnail_url || video.thumbnail || "",
      },
    } as any);
  }, []);

  const handleSearchImmediateChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (text.trim().length === 0) {
      setSubmittedSearchQuery("");
    }
  }, []);

  const handleSuggestionPress = useCallback((text: string) => {
    setSearchQuery(text);
    setSubmittedSearchQuery(text);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSubmittedSearchQuery("");
  }, []);

  const handleHeroPress = useCallback(
    (card: HeroCard) => {
      if (card.isCurrent) {
        router.push("/player" as any);
        return;
      }

      playCatalogSong(card.song);
    },
    [playCatalogSong]
  );

  const handleHeroMomentumEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const offset = event.nativeEvent.contentOffset.x || 0;
      const nextIndex = Math.max(
        0,
        Math.min(heroCards.length - 1, Math.round(offset / heroCardWidth))
      );
      heroIndexRef.current = nextIndex;
      setHeroIndex(nextIndex);
    },
    [heroCardWidth, heroCards.length]
  );

  const renderHeroCard = useCallback(
    ({ item, index }: { item: HeroCard; index: number }) => {
      const isPlayingCard =
        Boolean(currentSong) &&
        String(item.song?.id || "") === String(currentSong?.id || "");

      return (
        <View style={[styles.heroSlide, { width: heroCardWidth }]}>
          <LinearGradient colors={GRADIENTS.neon} style={styles.heroBorder}>
            <TouchableOpacity
              activeOpacity={0.92}
              style={[styles.heroCard, { height: heroCardHeight }]}
              onPress={() => handleHeroPress(item)}
            >
              <HTImage source={item.song} style={styles.heroImage} />

              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.98)"]}
                style={styles.heroOverlay}
              >
                <View style={styles.livePill}>
                  {isPlayingCard ? (
                    <NeonEQ isPlaying={isPlaying} size="small" />
                  ) : (
                    <Ionicons name={item.icon} size={13} color={COLORS.primary} />
                  )}
                  <Text style={styles.liveText}>
                    {isPlayingCard ? "Now Playing" : item.label}
                  </Text>
                </View>

                <Text numberOfLines={1} style={styles.heroSong}>
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={styles.heroArtist}>
                  {item.subtitle}
                </Text>

                <View style={styles.heroBottomRow}>
                  <View style={styles.heroPlayButton}>
                    <Ionicons
                      name={isPlayingCard && isPlaying ? "pause" : "play"}
                      size={18}
                      color="#000"
                    />
                    <Text style={styles.heroPlayText}>
                      {isPlayingCard ? "OPEN PLAYER" : "PLAY"}
                    </Text>
                  </View>

                  {heroCards.length > 1 ? (
                    <View style={styles.heroCountPill}>
                      <Text style={styles.heroCountText}>
                        {index + 1}/{heroCards.length}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      );
    },
    [currentSong?.id, handleHeroPress, heroCardHeight, heroCardWidth, heroCards.length, isPlaying]
  );

  const keyExtractor = useCallback(
    (item: HiddenTunesSong, index: number) => String(item.id || index),
    []
  );

  const renderSongItem = useCallback(
    ({ item }: { item: HiddenTunesSong; index: number }) => (
      <HomeCatalogSongRow
        song={item as unknown as HiddenTunesNormalizedSong}
        image={item.cover || item.artwork || item.thumbnail || ""}
        onPress={playCatalogSong as (song: HiddenTunesNormalizedSong) => void}
      />
    ),
    [playCatalogSong]
  );

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <View style={styles.glowPurple} />
        <View style={styles.glowCyan} />
        <View style={styles.glowCenter} />

        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>HOME</Text>
            <Text style={styles.title}>Hidden Tunes</Text>
            <Text style={styles.subtitle}>Cinematic catalog · search · playback</Text>
          </View>

          <TouchableOpacity style={styles.refreshButton} onPress={refreshCatalog}>
            <Ionicons name="refresh" size={22} color={COLORS.cyan} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading your music...</Text>
          </View>
        ) : songs.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Ionicons name="musical-notes" size={58} color={COLORS.primary} />
            </View>

            <Text style={styles.emptyTitle}>Nothing here yet</Text>

            <Text style={styles.emptyText}>
              New releases will appear here as they are added to Hidden Tunes.
            </Text>
          </View>
        ) : (
          <FlatList
            data={hasSearchText ? [] : songs}
            keyExtractor={keyExtractor}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refreshCatalog}
                tintColor={COLORS.primary}
              />
            }
            ListHeaderComponent={
              <View>
                {heroCards.length > 0 && !hasSearchText ? (
                  <View style={styles.heroStage}>
                    <View style={styles.heroStageGlow} />
                    <FlatList
                      horizontal
                      data={heroCards}
                      keyExtractor={(item) => item.key}
                      renderItem={renderHeroCard}
                      showsHorizontalScrollIndicator={false}
                      snapToInterval={heroCardWidth}
                      decelerationRate="fast"
                      onMomentumScrollEnd={handleHeroMomentumEnd}
                      contentContainerStyle={styles.heroList}
                    />

                    {heroCards.length > 1 ? (
                      <View style={styles.heroDots}>
                        {heroCards.map((card, index) => (
                          <View
                            key={card.key}
                            style={[
                              styles.heroDot,
                              index === heroIndex && styles.heroDotActive,
                            ]}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {!hasSearchText ? (
                  <View style={styles.listeningBrief}>
                    <View style={styles.listeningBriefCopy}>
                      <Text style={styles.listeningLabel}>
                        {currentSong ? "NOW PLAYING" : "DISCOVERY"}
                      </Text>
                      <Text numberOfLines={1} style={styles.listeningTitle}>
                        {currentSong?.title || "Premium listening starts here"}
                      </Text>
                      <Text numberOfLines={1} style={styles.listeningSubtitle}>
                        {currentSong?.artist ||
                          currentSong?.user?.name ||
                          "Fresh songs, worlds, and moods ready to play"}
                      </Text>
                    </View>

                    <View style={styles.waveformShell}>
                      <LiveWaveform
                        isPlaying={isPlaying}
                        size="small"
                        color={COLORS.primaryGlow}
                      />
                    </View>
                  </View>
                ) : null}

                {!hasSearchText ? (
                  <View style={styles.discoveryStrip}>
                    <TouchableOpacity
                      activeOpacity={0.88}
                      style={styles.discoveryChip}
                      onPress={() => router.push("/worlds" as any)}
                    >
                      <Ionicons name="sparkles" size={15} color={COLORS.primaryGlow} />
                      <Text style={styles.discoveryChipText}>Explore Worlds</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.88}
                      style={styles.discoveryChip}
                      onPress={() => router.push("/radio" as any)}
                    >
                      <Ionicons name="radio" size={15} color={COLORS.cyan} />
                      <Text style={styles.discoveryChipText}>Personal Radio</Text>
                    </TouchableOpacity>

                    <SubtleTvEntryLink style={styles.tvLink} />
                  </View>
                ) : null}

                {!hasSearchText && moodGenreChips.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.moodChipRow}
                  >
                    {moodGenreChips.map((genre) => (
                      <TouchableOpacity
                        key={genre.id}
                        activeOpacity={0.88}
                        style={styles.moodChip}
                        onPress={() => openGenre(genre)}
                      >
                        <Text style={styles.moodChipText}>{genre.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : null}

                <View style={[styles.searchPanel, { padding: searchPanelPadding }]}>
                  <View style={styles.searchPanelHeader}>
                    <Ionicons name="search" size={18} color={COLORS.cyan} />
                    <Text style={styles.searchPanelTitle}>Universal Search</Text>
                  </View>

                  <DebouncedSearchInput
                    value={searchQuery}
                    onImmediateChange={handleSearchImmediateChange}
                    onDebouncedChange={setSubmittedSearchQuery}
                    onClear={clearSearch}
                    placeholder="Search songs, artists, albums, genres..."
                    placeholderTextColor={COLORS.textMuted}
                    style={styles.searchInput}
                    containerStyle={styles.searchInputShell}
                  />
                </View>

                {hasSearchText ? (
                  <View style={styles.searchResultsPanel}>
                    <UniversalSearchGroupedResults
                      grouped={searchResults}
                      query={submittedSearchQuery || searchQuery}
                      onSongPress={playCatalogSong}
                      onLyricPress={playCatalogSong}
                      onArtistPress={openArtist}
                      onAlbumPress={openAlbum}
                      onGenrePress={openGenre}
                      onTvPress={openTv}
                      onSuggestionPress={handleSuggestionPress}
                      activeSongId={currentSong?.id ? String(currentSong.id) : null}
                      isPlaying={isPlaying}
                      showEmpty={showSearchResults}
                    />
                  </View>
                ) : (
                  <>
                    {featuredSongs.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <LinearGradient
                          colors={["rgba(168,85,247,0.22)", "rgba(34,211,238,0.08)"]}
                          style={styles.sectionAura}
                        />
                        <View style={styles.sectionHeaderRow}>
                          <View>
                            <Text style={styles.sectionEyebrow}>CURATED</Text>
                            <Text style={styles.sectionTitle}>Featured</Text>
                          </View>
                          <Text style={styles.sectionMeta}>Tap any card to play</Text>
                        </View>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.featuredRow}
                        >
                          {featuredSongs.map((item, index) => (
                            <HomeFeaturedCard
                              key={item.id}
                              item={item as unknown as HiddenTunesNormalizedSong}
                              index={index}
                              onPress={playCatalogSong as (song: HiddenTunesNormalizedSong) => void}
                            />
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {artists.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>CREATORS</Text>
                        <Text style={styles.sectionTitle}>Artists</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.surfaceRow}
                        >
                          {artists.map((artist) => (
                            <View key={artist.id} style={[styles.surfaceCardShell, { width: railCardWidth }]}>
                              <UnifiedMediaCard
                                title={artist.name}
                                subtitle={`${artist.songs.length} song${artist.songs.length === 1 ? "" : "s"}`}
                                imageUri={artist.artwork}
                                rightIcon="person"
                                onPress={() => openArtist(artist)}
                                onRightPress={() => openArtist(artist)}
                              />
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {albums.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>COLLECTIONS</Text>
                        <Text style={styles.sectionTitle}>Albums</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.surfaceRow}
                        >
                          {albums.map((album) => (
                            <View key={album.id} style={[styles.surfaceCardShell, { width: railCardWidth }]}>
                              <UnifiedMediaCard
                                title={album.title}
                                subtitle={album.artist}
                                imageUri={album.artwork}
                                rightIcon="albums"
                                onPress={() => openAlbum(album)}
                                onRightPress={() => openAlbum(album)}
                              />
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {genres.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>MOODS</Text>
                        <Text style={styles.sectionTitle}>Genres</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.surfaceRow}
                        >
                          {genres.map((genre) => (
                            <View key={genre.id} style={[styles.surfaceCardShell, { width: railCardWidth }]}>
                              <UnifiedMediaCard
                                title={genre.title}
                                subtitle={`${genre.songs.length} song${genre.songs.length === 1 ? "" : "s"}`}
                                imageUri={genre.artwork}
                                rightIcon="sparkles"
                                onPress={() => openGenre(genre)}
                                onRightPress={() => openGenre(genre)}
                              />
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {visiblePlaylists.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>MIXES</Text>
                        <Text style={styles.sectionTitle}>Catalog Mixes</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.surfaceRow}
                        >
                          {visiblePlaylists.map((playlist) => (
                            <View key={playlist.id} style={[styles.surfaceCardShell, { width: railCardWidth }]}>
                              <UnifiedMediaCard
                                title={playlist.title}
                                subtitle={playlist.description}
                                imageUri={playlist.artwork}
                                rightIcon="library"
                                onPress={() => router.push("/cloud-playlists" as any)}
                                onRightPress={() => router.push("/cloud-playlists" as any)}
                              />
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    <Text style={styles.sectionEyebrow}>CATALOG</Text>
                    <Text style={[styles.sectionTitle, styles.songsSectionTitle]}>Songs</Text>
                  </>
                )}
              </View>
            }
            renderItem={renderSongItem}
          />
        )}
      </LinearGradient>
    </AppShell>
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
    top: 40,
    left: -110,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(168,85,247,0.24)",
  },
  glowCyan: {
    position: "absolute",
    top: 280,
    right: -130,
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: "rgba(34,211,238,0.14)",
  },
  glowCenter: {
    position: "absolute",
    top: 180,
    alignSelf: "center",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(168,85,247,0.1)",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  headerCopy: { flex: 1, paddingRight: 12 },
  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(34,211,238,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.22)",
  },
  title: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    marginTop: 5,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  loadingText: { color: COLORS.textMuted, marginTop: 12, fontWeight: "700" },
  emptyIcon: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.1)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.25)",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 16,
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 21,
    fontWeight: "700",
  },
  list: { paddingBottom: 140 },
  heroStage: {
    marginBottom: 18,
    position: "relative",
  },
  heroStageGlow: {
    position: "absolute",
    top: 24,
    left: 24,
    right: 24,
    height: 220,
    borderRadius: 120,
    backgroundColor: "rgba(34,211,238,0.12)",
  },
  heroList: {
    paddingRight: 18,
  },
  heroSlide: {
    marginRight: 14,
  },
  heroBorder: {
    borderRadius: 34,
    padding: 2,
  },
  heroCard: {
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },
  heroImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  heroOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 20,
  },
  livePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    marginBottom: 12,
  },
  liveText: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  heroSong: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
  },
  heroArtist: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
  },
  heroBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
  },
  heroPlayButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
  },
  heroPlayText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  heroCountPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  heroCountText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "800",
  },
  heroDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
  },
  heroDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  heroDotActive: {
    width: 22,
    backgroundColor: COLORS.primary,
  },
  listeningBrief: {
    marginBottom: 14,
    borderRadius: 26,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  listeningBriefCopy: { flex: 1, paddingRight: 12 },
  listeningLabel: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  listeningTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 6,
  },
  listeningSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  waveformShell: {
    width: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  discoveryStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  discoveryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  discoveryChipText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  tvLink: {
    marginLeft: 0,
  },
  moodChipRow: {
    gap: 10,
    paddingRight: 18,
    marginBottom: 16,
  },
  moodChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.16)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.34)",
  },
  moodChipText: {
    color: COLORS.primaryGlow,
    fontSize: 12,
    fontWeight: "900",
  },
  searchPanel: {
    marginBottom: 22,
    borderRadius: 28,
    padding: 16,
    backgroundColor: "rgba(18,7,31,0.88)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.2)",
  },
  searchPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  searchPanelTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  searchInputShell: {
    minHeight: 46,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    paddingVertical: 0,
  },
  searchResultsPanel: {
    paddingBottom: 18,
  },
  cinematicSection: {
    marginBottom: 28,
    position: "relative",
    overflow: "hidden",
    borderRadius: 28,
    paddingTop: 4,
  },
  sectionAura: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    borderRadius: 28,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  sectionEyebrow: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },
  songsSectionTitle: {
    marginBottom: 12,
  },
  sectionMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  featuredRow: {
    paddingRight: 18,
    paddingLeft: 2,
  },
  surfaceRow: {
    gap: 12,
    paddingRight: 18,
    paddingLeft: 2,
  },
  surfaceCardShell: {
    width: 244,
  },
});
