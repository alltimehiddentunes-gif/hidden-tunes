import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import NeonEQ from "@/components/NeonEQ";
import UnifiedMediaCard from "@/components/UnifiedMediaCard";
import UniversalSearchGroupedResults from "@/components/UniversalSearchGroupedResults";
import { HomeCatalogSongRow, HomeFeaturedCard } from "@/components/catalog/HomePlaybackRows";
import DebouncedSearchInput from "@/components/search/DebouncedSearchInput";
import { COLORS, GRADIENTS } from "@/constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
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

export default function MusicFeedScreen() {
  const { playSong } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();

  const [catalog, setCatalog] = useState<HiddenTunesDerivedCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState("");

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

        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={26} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.headerTextBox}>
            <Text style={styles.title}>Hidden Tunes</Text>
            <Text style={styles.subtitle}>Premium home, search, and catalog playback</Text>
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
                <View style={styles.feedHero}>
                  <LinearGradient colors={GRADIENTS.neon} style={styles.feedBorder}>
                    <View style={styles.feedInner}>
                      <View style={styles.feedCopy}>
                        <Text style={styles.feedLabel}>PREMIUM HOME</Text>
                        <Text style={styles.feedTitle}>
                          {songs.length} song{songs.length === 1 ? "" : "s"} available
                        </Text>
                        <Text style={styles.feedText}>
                          Search the catalog or continue with featured Hidden Tunes.
                        </Text>
                      </View>

                      <NeonEQ isPlaying={isPlaying} size="medium" />
                    </View>
                  </LinearGradient>
                </View>

                <View style={styles.searchPanel}>
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
                    {featuredSongs.length > 0 && (
                      <View style={styles.surfaceSection}>
                        <View style={styles.sectionHeaderRow}>
                          <Text style={styles.sectionTitle}>Featured</Text>
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
                    )}

                    {artists.length > 0 && (
                      <View style={styles.surfaceSection}>
                        <Text style={styles.sectionTitle}>Artists</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.surfaceRow}>
                          {artists.map((artist) => (
                            <View key={artist.id} style={styles.surfaceCardShell}>
                              <UnifiedMediaCard
                                title={artist.name}
                                subtitle={String(artist.songs.length) + " song" + (artist.songs.length === 1 ? "" : "s")}
                                imageUri={artist.artwork}
                                rightIcon="person"
                                onPress={() => openArtist(artist)}
                                onRightPress={() => openArtist(artist)}
                              />
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    {albums.length > 0 && (
                      <View style={styles.surfaceSection}>
                        <Text style={styles.sectionTitle}>Albums</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.surfaceRow}>
                          {albums.map((album) => (
                            <View key={album.id} style={styles.surfaceCardShell}>
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
                    )}

                    {genres.length > 0 && (
                      <View style={styles.surfaceSection}>
                        <Text style={styles.sectionTitle}>Genres</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.surfaceRow}>
                          {genres.map((genre) => (
                            <View key={genre.id} style={styles.surfaceCardShell}>
                              <UnifiedMediaCard
                                title={genre.title}
                                subtitle={String(genre.songs.length) + " song" + (genre.songs.length === 1 ? "" : "s")}
                                imageUri={genre.artwork}
                                rightIcon="sparkles"
                                onPress={() => openGenre(genre)}
                                onRightPress={() => openGenre(genre)}
                              />
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    {visiblePlaylists.length > 0 && (
                      <View style={styles.surfaceSection}>
                        <Text style={styles.sectionTitle}>Catalog Mixes</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.surfaceRow}>
                          {visiblePlaylists.map((playlist) => (
                            <View key={playlist.id} style={styles.surfaceCardShell}>
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
                    )}

                    <Text style={styles.sectionTitle}>Songs</Text>
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
    backgroundColor: "rgba(168,85,247,0.2)",
  },
  glowCyan: {
    position: "absolute",
    top: 280,
    right: -130,
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: "rgba(34,211,238,0.12)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 22,
  },
  headerTextBox: { flex: 1 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
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
  title: { color: COLORS.text, fontSize: 28, fontWeight: "900" },
  subtitle: {
    color: COLORS.textMuted,
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
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
  feedHero: { marginBottom: 16 },
  feedBorder: { borderRadius: 30, padding: 2 },
  feedInner: {
    minHeight: 128,
    borderRadius: 28,
    padding: 20,
    backgroundColor: "rgba(18,7,31,0.94)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  feedCopy: { flex: 1, paddingRight: 12 },
  feedLabel: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  feedTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 7,
  },
  feedText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
    lineHeight: 19,
  },
  searchPanel: {
    marginBottom: 20,
    borderRadius: 24,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchInputShell: {
    minHeight: 44,
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
  surfaceSection: { marginBottom: 22 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 12,
  },
  sectionMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  featuredRow: {
    paddingRight: 18,
  },
  surfaceRow: {
    gap: 12,
    paddingRight: 18,
  },
  surfaceCardShell: {
    width: 244,
  },
});
