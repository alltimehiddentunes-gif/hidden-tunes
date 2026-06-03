import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import { SubtleTvEntryLink } from "../../components/EmotionalDiscoveryChips";
import MoodRoomCard from "../../components/explore/MoodRoomCard";
import WorldsExploreSection from "../../components/explore/WorldsExploreSection";
import AppShell from "../../components/navigation/AppShell";
import UnifiedMediaCard from "../../components/UnifiedMediaCard";
import { COLORS, GRADIENTS } from "../../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "../../context/PlayerContext";
import {
  fetchHiddenTunesCatalog,
  type HiddenTunesAlbumCatalogItem,
  type HiddenTunesArtistCatalogItem,
  type HiddenTunesDerivedCatalog,
  type HiddenTunesGenreCatalogItem,
  type HiddenTunesSong,
} from "../../services/hiddenTunes";
import {
  buildMoodRoomGroups,
  type MoodRoomGroup,
} from "../../utils/moodRooms";
import WorldGalleryScreen from "../../screens/WorldGalleryScreen";

type ExploreMoodRoom = MoodRoomGroup<HiddenTunesSong>;

const EMPTY_CATALOG: HiddenTunesDerivedCatalog = {
  songs: [],
  artists: [],
  albums: [],
  genres: [],
  playlists: [],
};

function findSongIndex(songs: HiddenTunesSong[], song: { id?: string }) {
  const id = String(song?.id || "");
  return songs.findIndex((candidate) => String(candidate.id) === id);
}

export default function WorldsIndexScreen() {
  const { width: viewportWidth } = useWindowDimensions();
  const compactLayout = viewportWidth < 380;
  const horizontalPadding = compactLayout ? 16 : 18;
  const railCardWidth = Math.min(244, Math.max(204, viewportWidth * 0.62));
  const railGap = compactLayout ? 10 : 12;

  const { playSong } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();
  const { recentlyPlayed } = usePlayerState();

  const [catalog, setCatalog] = useState<HiddenTunesDerivedCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  const [moodRooms, setMoodRooms] = useState<ExploreMoodRoom[]>([]);

  const songs = catalog.songs;
  const artists = catalog.artists;
  const albums = catalog.albums;
  const genres = catalog.genres;

  const loadExplore = useCallback(async () => {
    setLoading(true);

    try {
      const data = await fetchHiddenTunesCatalog();
      setCatalog(data);
      setMoodRooms(buildMoodRoomGroups(data.songs, 6));
    } catch {
      setCatalog(EMPTY_CATALOG);
      setMoodRooms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExplore();
  }, [loadExplore]);

  const continueTracks = useMemo(() => {
    if (!Array.isArray(recentlyPlayed) || recentlyPlayed.length === 0) {
      return [] as HiddenTunesSong[];
    }

    const resolved: HiddenTunesSong[] = [];

    recentlyPlayed.forEach((entry) => {
      const match = songs.find((song) => String(song.id) === String(entry?.id));
      if (match) {
        resolved.push(match);
      }
    });

    return resolved.slice(0, 8);
  }, [recentlyPlayed, songs]);

  const smartPicks = useMemo(() => songs.slice(0, 6), [songs]);
  const visibleArtists = useMemo(() => artists.slice(0, 10), [artists]);
  const visibleAlbums = useMemo(() => albums.slice(0, 10), [albums]);
  const visibleGenres = useMemo(() => genres.slice(0, 10), [genres]);

  const openMoodRoom = useCallback((room: ExploreMoodRoom) => {
    router.push({
      pathname: "/genre",
      params: {
        id: room.id,
        title: room.title,
        query: room.title,
        type: "mood",
      },
    } as any);
  }, []);

  const playCatalogSong = useCallback(
    (song: HiddenTunesSong) => {
      const index = findSongIndex(songs, song);
      const catalogSong = index >= 0 ? songs[index] : song;
      void playSong(catalogSong, songs, Math.max(index, 0));
    },
    [playSong, songs]
  );

  const openArtist = useCallback((artist: HiddenTunesArtistCatalogItem) => {
    router.push({ pathname: "/artist", params: { artist: artist.name } } as any);
  }, []);

  const openAlbum = useCallback((album: HiddenTunesAlbumCatalogItem) => {
    router.push({
      pathname: "/album",
      params: {
        album: album.title,
        artist: album.artist,
        thumbnail: album.artwork,
      },
    } as any);
  }, []);

  const openGenre = useCallback((genre: HiddenTunesGenreCatalogItem) => {
    router.push({
      pathname: "/genre",
      params: {
        title: genre.title,
        query: genre.title,
        id: genre.id,
        type: "genre",
      },
    } as any);
  }, []);

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <View style={styles.glowPurple} />
        <View style={styles.glowCyan} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding }]}
        >
          <View style={styles.topBar}>
            <View style={styles.heroCopy}>
              <Text style={styles.kicker}>EXPLORE</Text>
              <Text style={styles.title}>Discovery</Text>
              <Text style={styles.subtitle}>Artists, albums, genres, and worlds.</Text>
            </View>

            <TouchableOpacity style={styles.refreshButton} onPress={loadExplore}>
              <Ionicons name="refresh" size={22} color={COLORS.cyan} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading discovery</Text>
            </View>
          ) : (
            <>
              <View style={[styles.discoveryIntro, compactLayout && styles.discoveryIntroCompact]}>
                <View style={styles.discoveryIntroGlow} />
                <Text style={styles.discoveryEyebrow}>CATALOG</Text>
                <Text style={styles.discoveryTitle}>
                  {songs.length > 0
                    ? `${songs.length} tracks ready`
                    : "Catalog loading"}
                </Text>
                <Text style={styles.discoveryText}>
                  {currentSong
                    ? `Now playing · ${currentSong.title || "your current song"}`
                    : "Choose a rail"}
                </Text>

                <View style={styles.discoveryActions}>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    style={styles.discoveryChip}
                    onPress={() => router.push("/music-feed" as any)}
                  >
                    <Ionicons name="home" size={15} color={COLORS.primaryGlow} />
                    <Text style={styles.discoveryChipText}>Home</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.88}
                    style={styles.discoveryChip}
                    onPress={() => router.push("/radio" as any)}
                  >
                    <Ionicons name="radio" size={15} color={COLORS.cyan} />
                    <Text style={styles.discoveryChipText}>Radio</Text>
                  </TouchableOpacity>

                  <SubtleTvEntryLink style={styles.tvLink} />
                </View>
              </View>

              {moodRooms.length > 0 ? (
                <View style={[styles.cinematicSection, compactLayout && styles.cinematicSectionCompact]}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>MOOD</Text>
                      <Text style={styles.sectionTitle}>Mood Rooms</Text>
                    </View>
                    <Text style={styles.sectionMeta}>Matches</Text>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled
                    contentContainerStyle={[styles.moodRail, { gap: railGap, paddingRight: horizontalPadding }]}
                  >
                    {moodRooms.map((room) => (
                      <MoodRoomCard
                        key={room.id}
                        title={room.title}
                        subtitle={room.subtitle}
                        artwork={room.artwork[0]}
                        gradient={room.gradient}
                        onPress={() => openMoodRoom(room)}
                      />
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {continueTracks.length > 0 ? (
                <View style={[styles.cinematicSection, compactLayout && styles.cinematicSectionCompact]}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>CONTINUE</Text>
                      <Text style={styles.sectionTitle}>Continue Listening</Text>
                    </View>
                    <Text style={styles.sectionMeta}>
                      {isPlaying ? "Playing" : "Recent"}
                    </Text>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled
                    contentContainerStyle={[styles.mediaRail, { gap: railGap, paddingRight: horizontalPadding }]}
                  >
                    {continueTracks.map((song) => (
                      <View key={`continue-${song.id}`} style={[styles.mediaCardShell, { width: railCardWidth }]}>
                        <UnifiedMediaCard
                          title={song.title}
                          subtitle={song.artist}
                          imageUri={song.cover || song.artwork || song.thumbnail}
                          rightIcon="play"
                          onPress={() => playCatalogSong(song)}
                          onRightPress={() => playCatalogSong(song)}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {smartPicks.length > 0 ? (
                <View style={[styles.cinematicSection, compactLayout && styles.cinematicSectionCompact]}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>CURATED</Text>
                      <Text style={styles.sectionTitle}>Picks</Text>
                    </View>
                    <Text style={styles.sectionMeta}>Play</Text>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled
                    contentContainerStyle={[styles.mediaRail, { gap: railGap, paddingRight: horizontalPadding }]}
                  >
                    {smartPicks.map((song) => (
                      <View key={`pick-${song.id}`} style={[styles.mediaCardShell, { width: railCardWidth }]}>
                        <UnifiedMediaCard
                          title={song.title}
                          subtitle={song.artist}
                          imageUri={song.cover || song.artwork || song.thumbnail}
                          rightIcon="sparkles"
                          onPress={() => playCatalogSong(song)}
                          onRightPress={() => playCatalogSong(song)}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {visibleArtists.length > 0 ? (
                <View style={[styles.cinematicSection, compactLayout && styles.cinematicSectionCompact]}>
                  <Text style={styles.sectionEyebrow}>CREATORS</Text>
                  <Text style={styles.sectionTitle}>Artists</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled
                    contentContainerStyle={[styles.mediaRail, { gap: railGap, paddingRight: horizontalPadding }]}
                  >
                    {visibleArtists.map((artist) => (
                      <View key={artist.id} style={[styles.mediaCardShell, { width: railCardWidth }]}>
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

              {visibleAlbums.length > 0 ? (
                <View style={[styles.cinematicSection, compactLayout && styles.cinematicSectionCompact]}>
                  <Text style={styles.sectionEyebrow}>COLLECTIONS</Text>
                  <Text style={styles.sectionTitle}>Albums</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled
                    contentContainerStyle={[styles.mediaRail, { gap: railGap, paddingRight: horizontalPadding }]}
                  >
                    {visibleAlbums.map((album) => (
                      <View key={album.id} style={[styles.mediaCardShell, { width: railCardWidth }]}>
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

              {visibleGenres.length > 0 ? (
                <View style={[styles.cinematicSection, compactLayout && styles.cinematicSectionCompact]}>
                  <Text style={styles.sectionEyebrow}>GENRES</Text>
                  <Text style={styles.sectionTitle}>Genres</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled
                    contentContainerStyle={[styles.mediaRail, { gap: railGap, paddingRight: horizontalPadding }]}
                  >
                    {visibleGenres.map((genre) => (
                      <View key={genre.id} style={[styles.mediaCardShell, { width: railCardWidth }]}>
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

              <View style={[styles.cinematicSection, compactLayout && styles.cinematicSectionCompact]}>
                <Text style={styles.sectionEyebrow}>WORLDS</Text>
                <Text style={styles.sectionTitle}>Emotional Worlds</Text>
                <WorldsExploreSection showSeeAll={false} />
              </View>

              <WorldGalleryScreen embedded />
            </>
          )}
        </ScrollView>
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 50,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 136,
  },
  glowPurple: {
    position: "absolute",
    top: -40,
    left: -90,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: "rgba(168,85,247,0.12)",
  },
  glowCyan: {
    position: "absolute",
    top: 120,
    right: -100,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: "rgba(34,211,238,0.07)",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  heroCopy: {
    flex: 1,
    paddingRight: 12,
  },
  kicker: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 6,
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
  loadingBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 10,
    fontWeight: "700",
  },
  discoveryIntro: {
    borderRadius: 24,
    padding: 14,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  discoveryIntroCompact: {
    padding: 15,
    borderRadius: 26,
  },
  discoveryIntroGlow: {
    position: "absolute",
    top: -48,
    right: -38,
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: "rgba(168,85,247,0.07)",
  },
  discoveryEyebrow: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  discoveryTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 7,
  },
  discoveryText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 6,
  },
  discoveryActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  discoveryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  cinematicSection: {
    marginTop: 18,
  },
  cinematicSectionCompact: {
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 11,
  },
  sectionEyebrow: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
  },
  sectionMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  moodRail: {
    gap: 12,
    paddingRight: 18,
  },
  mediaRail: {
    gap: 12,
    paddingRight: 18,
  },
  mediaCardShell: {
    width: 244,
    maxWidth: "70%",
  },
});
