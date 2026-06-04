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

import MoodRoomCard from "../../components/explore/MoodRoomCard";
import WorldsExploreSection from "../../components/explore/WorldsExploreSection";
import HTImage from "../../components/HTImage";
import AppShell from "../../components/navigation/AppShell";
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

type ListeningRoom = {
  id: string;
  title: string;
  subtitle: string;
  artwork: string;
  songs: HiddenTunesSong[];
};

function getArtwork(song?: HiddenTunesSong | null) {
  return song?.cover || song?.artwork || song?.thumbnail || "";
}

function songSearchText(song: HiddenTunesSong) {
  return [song.title, song.artist, song.album, song.genre, song.mood, song.lyrics]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function uniqSongs(songs: HiddenTunesSong[]) {
  const seen = new Set<string>();
  return songs.filter((song) => {
    const id = String(song.id || `${song.artist}-${song.title}`);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildListeningRoom(
  id: string,
  title: string,
  terms: string[],
  songs: HiddenTunesSong[]
): ListeningRoom | null {
  const matches = songs.filter((song) => {
    const text = songSearchText(song);
    return terms.some((term) => text.includes(term.toLowerCase()));
  });
  const roomSongs = uniqSongs(matches).slice(0, 18);
  if (!roomSongs.length) return null;
  return {
    id,
    title,
    subtitle: `${roomSongs.length} song${roomSongs.length === 1 ? "" : "s"}`,
    artwork: getArtwork(roomSongs[0]),
    songs: roomSongs,
  };
}

function buildListeningRooms(songs: HiddenTunesSong[]) {
  return [
    buildListeningRoom("calm", "Calm", ["calm", "peace", "quiet", "soft"], songs),
    buildListeningRoom("instrumental", "Instrumental", ["instrumental", "ambient", "piano"], songs),
    buildListeningRoom("night-drive", "Night Drive", ["night", "late", "midnight", "drive"], songs),
    buildListeningRoom("worship-focus", "Worship Focus", ["worship", "gospel", "prayer", "praise", "jesus"], songs),
    buildListeningRoom("healing", "Healing", ["healing", "heal", "restore", "peace"], songs),
  ].filter(Boolean) as ListeningRoom[];
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

    const currentMatch = currentSong?.id
      ? songs.find((song) => String(song.id) === String(currentSong.id))
      : null;

    return uniqSongs([...(currentMatch ? [currentMatch] : []), ...resolved]).slice(0, 8);
  }, [currentSong?.id, recentlyPlayed, songs]);

  const smartPicks = useMemo(() => songs.slice(0, 8), [songs]);
  const premiumListSongs = useMemo(() => songs.slice(0, 12), [songs]);
  const deepCutSongs = useMemo(() => songs.slice(12, 22), [songs]);
  const listeningRooms = useMemo(() => buildListeningRooms(songs), [songs]);
  const visibleArtists = useMemo(() => artists.slice(0, 10), [artists]);
  const visibleAlbums = useMemo(() => albums.slice(0, 10), [albums]);
  const visibleGenres = useMemo(() => {
    const recentGenres = new Set(
      (Array.isArray(recentlyPlayed) ? recentlyPlayed : [])
        .map((entry) => {
          const match = songs.find((song) => String(song.id) === String(entry?.id));
          return String(match?.genre || "").toLowerCase();
        })
        .filter(Boolean)
    );
    const preferred = genres.filter((genre) => recentGenres.has(String(genre.title || "").toLowerCase()));
    const remaining = genres.filter((genre) => !preferred.some((item) => item.id === genre.id));
    return [...preferred, ...remaining].slice(0, 10);
  }, [genres, recentlyPlayed, songs]);

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
      void playSong(catalogSong, songs, Math.max(index, 0), {
        source: "full_catalog",
        label: "Explore",
        artistName: catalogSong.artist,
        genre: catalogSong.genre,
        mood: catalogSong.mood,
      });
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
              <Text style={styles.kicker}>Explore</Text>
              <Text style={styles.title}>Hidden Tunes</Text>
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
              <View style={[styles.smartHero, compactLayout && styles.smartHeroCompact]}>
                <View style={styles.smartGlow} />
                <View style={styles.smartTopRow}>
                  <View style={styles.smartIcon}>
                    <Ionicons name="sparkles" size={22} color={COLORS.primaryGlow} />
                  </View>
                  <View style={styles.smartCopy}>
                    <Text style={styles.discoveryEyebrow}>SMART ON</Text>
                    <Text style={styles.discoveryTitle}>Enter a listening room</Text>
                  </View>
                </View>
                <Text style={styles.discoveryText}>
                  {currentSong
                    ? `Now tuned to ${currentSong.title || "Hidden Tunes"}`
                    : `${songs.length} tracks ready for discovery`}
                </Text>
                <View style={styles.heroActionRow}>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    style={styles.startButton}
                    onPress={() => {
                      const first = smartPicks[0] || songs[0];
                      if (first) playCatalogSong(first);
                    }}
                  >
                    <Ionicons name="play" size={17} color="#000" />
                    <Text style={styles.startButtonText}>Start Discovery</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    style={styles.searchButton}
                    onPress={() => router.push("/search" as any)}
                  >
                    <Ionicons name="search" size={17} color={COLORS.text} />
                    <Text style={styles.searchButtonText}>Search</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {continueTracks.length > 0 ? (
                <View style={styles.continueCard}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>CONTINUE</Text>
                      <Text style={styles.sectionTitle}>Continue Listening</Text>
                    </View>
                    <Text style={styles.sectionMeta}>{isPlaying ? "Playing" : "Recent"}</Text>
                  </View>
                  {continueTracks.slice(0, 3).map((song) => (
                    <TouchableOpacity
                      key={`continue-${song.id}`}
                      activeOpacity={0.88}
                      style={styles.compactSongRow}
                      onPress={() => playCatalogSong(song)}
                    >
                      <HTImage source={song} style={styles.compactArt} contentFit="cover" />
                      <View style={styles.songTextBox}>
                        <Text numberOfLines={1} style={styles.songTitle}>{song.title}</Text>
                        <Text numberOfLines={1} style={styles.songArtist}>{song.artist}</Text>
                      </View>
                      <View style={styles.rowPlayButton}>
                        <Ionicons name="play" size={15} color="#000" />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {premiumListSongs.length > 0 ? (
                <View style={[styles.cinematicSection, compactLayout && styles.cinematicSectionCompact]}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>SONGS</Text>
                      <Text style={styles.sectionTitle}>Premium Song List</Text>
                    </View>
                    <Text style={styles.sectionMeta}>Tap to play</Text>
                  </View>
                  <View style={styles.songListPanel}>
                    {premiumListSongs.map((song) => (
                      <TouchableOpacity
                        key={`premium-${song.id}`}
                        activeOpacity={0.88}
                        style={styles.premiumSongRow}
                        onPress={() => playCatalogSong(song)}
                      >
                        <HTImage source={song} style={styles.songArtwork} contentFit="cover" />
                        <View style={styles.songTextBox}>
                          <Text numberOfLines={1} style={styles.songTitle}>{song.title}</Text>
                          <Text numberOfLines={1} style={styles.songArtist}>{song.artist}</Text>
                        </View>
                        <Ionicons name="play-circle" size={30} color={COLORS.primaryGlow} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}

              {moodRooms.length > 0 ? (
                <View style={[styles.cinematicSection, compactLayout && styles.cinematicSectionCompact]}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>MOOD</Text>
                      <Text style={styles.sectionTitle}>Mood Rooms</Text>
                    </View>
                    <Text style={styles.sectionMeta}>Real matches</Text>
                  </View>
                  <View style={styles.moodGrid}>
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
                  </View>
                </View>
              ) : null}

              {visibleGenres.length > 0 ? (
                <View style={[styles.cinematicSection, compactLayout && styles.cinematicSectionCompact]}>
                  <Text style={styles.sectionEyebrow}>GENRES</Text>
                  <Text style={styles.sectionTitle}>Genre Spotlights</Text>
                  <View style={styles.genreList}>
                    {visibleGenres.map((genre) => (
                      <TouchableOpacity
                        key={genre.id}
                        activeOpacity={0.88}
                        style={styles.genreRow}
                        onPress={() => openGenre(genre)}
                      >
                        <HTImage source={genre.artwork} style={styles.genreArt} contentFit="cover" />
                        <View style={styles.songTextBox}>
                          <Text numberOfLines={1} style={styles.songTitle}>{genre.title}</Text>
                          <Text style={styles.songArtist}>{genre.songs.length} song{genre.songs.length === 1 ? "" : "s"}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={19} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}

              {listeningRooms.length > 0 ? (
                <View style={[styles.cinematicSection, compactLayout && styles.cinematicSectionCompact]}>
                  <Text style={styles.sectionEyebrow}>ROOMS</Text>
                  <Text style={styles.sectionTitle}>Listening Rooms</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled
                    contentContainerStyle={[styles.roomRail, { gap: railGap, paddingRight: horizontalPadding }]}
                  >
                    {listeningRooms.map((room) => (
                      <TouchableOpacity
                        key={room.id}
                        activeOpacity={0.88}
                        style={styles.listeningRoomCard}
                        onPress={() =>
                          router.push({
                            pathname: "/genre",
                            params: { id: room.id, title: room.title, query: room.title, type: "mood" },
                          } as any)
                        }
                      >
                        <HTImage source={room.artwork} style={styles.roomImage} contentFit="cover" />
                        <View style={styles.roomShade} />
                        <Text numberOfLines={1} style={styles.roomTitle}>{room.title}</Text>
                        <Text style={styles.roomSubtitle}>{room.subtitle}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {(visibleAlbums.length > 0 || deepCutSongs.length > 0) ? (
                <View style={[styles.cinematicSection, compactLayout && styles.cinematicSectionCompact]}>
                  <Text style={styles.sectionEyebrow}>DEEP CUTS</Text>
                  <Text style={styles.sectionTitle}>Deep Cuts & Albums</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled
                    contentContainerStyle={[styles.mediaRail, { gap: railGap, paddingRight: horizontalPadding }]}
                  >
                    {visibleAlbums.map((album) => (
                      <TouchableOpacity
                        key={`album-${album.id}`}
                        activeOpacity={0.88}
                        style={[styles.albumCard, { width: railCardWidth }]}
                        onPress={() => openAlbum(album)}
                      >
                        <HTImage source={album.artwork} style={styles.albumArt} contentFit="cover" />
                        <Text numberOfLines={1} style={styles.cardTitle}>{album.title}</Text>
                        <Text numberOfLines={1} style={styles.cardSubtitle}>{album.songs.length} song{album.songs.length === 1 ? "" : "s"} / {album.artist}</Text>
                      </TouchableOpacity>
                    ))}
                    {deepCutSongs.map((song) => (
                      <TouchableOpacity
                        key={`deep-${song.id}`}
                        activeOpacity={0.88}
                        style={[styles.albumCard, { width: railCardWidth }]}
                        onPress={() => playCatalogSong(song)}
                      >
                        <HTImage source={song} style={styles.albumArt} contentFit="cover" />
                        <Text numberOfLines={1} style={styles.cardTitle}>{song.title}</Text>
                        <Text numberOfLines={1} style={styles.cardSubtitle}>{song.artist}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {visibleArtists.length > 0 ? (
                <View style={[styles.cinematicSection, compactLayout && styles.cinematicSectionCompact]}>
                  <Text style={styles.sectionEyebrow}>CREATORS</Text>
                  <Text style={styles.sectionTitle}>Creators To Follow</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled
                    contentContainerStyle={[styles.mediaRail, { gap: railGap, paddingRight: horizontalPadding }]}
                  >
                    {visibleArtists.map((artist) => (
                      <TouchableOpacity
                        key={artist.id}
                        activeOpacity={0.88}
                        style={[styles.creatorCard, { width: railCardWidth }]}
                        onPress={() => openArtist(artist)}
                      >
                        <HTImage source={artist.artwork} style={styles.creatorArt} contentFit="cover" />
                        <Text numberOfLines={1} style={styles.cardTitle}>{artist.name}</Text>
                        <Text style={styles.cardSubtitle}>{artist.songs.length} song{artist.songs.length === 1 ? "" : "s"}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <View style={[styles.worldsSection, compactLayout && styles.cinematicSectionCompact]}>
                <Text style={styles.sectionEyebrow}>WORLDS</Text>
                <Text style={styles.sectionTitle}>Emotional Worlds</Text>
                <WorldsExploreSection showSeeAll={false} />
              </View>

              <View style={styles.galleryWrap}>
                <WorldGalleryScreen embedded />
              </View>
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
  smartHero: {
    borderRadius: 26,
    padding: 16,
    marginBottom: 20,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
  },
  smartHeroCompact: {
    padding: 14,
  },
  smartGlow: {
    position: "absolute",
    top: -58,
    right: -36,
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: "rgba(168,85,247,0.11)",
  },
  smartTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  smartIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.14)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.26)",
  },
  smartCopy: {
    flex: 1,
  },
  heroActionRow: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  startButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  startButtonText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "900",
  },
  searchButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  searchButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },
  continueCard: {
    borderRadius: 24,
    padding: 13,
    marginBottom: 20,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  compactSongRow: {
    minHeight: 58,
    borderRadius: 18,
    padding: 8,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  compactArt: {
    width: 44,
    height: 44,
    borderRadius: 13,
  },
  songTextBox: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
  },
  songTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  songArtist: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  rowPlayButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  songListPanel: {
    borderRadius: 22,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  premiumSongRow: {
    minHeight: 66,
    borderRadius: 18,
    padding: 9,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.045)",
    marginBottom: 8,
  },
  songArtwork: {
    width: 50,
    height: 50,
    borderRadius: 15,
  },
  moodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  genreList: {
    gap: 9,
  },
  genreRow: {
    minHeight: 64,
    borderRadius: 19,
    padding: 9,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  genreArt: {
    width: 48,
    height: 48,
    borderRadius: 15,
  },
  roomRail: {
    gap: 12,
    paddingRight: 18,
  },
  listeningRoomCard: {
    width: 188,
    height: 136,
    borderRadius: 22,
    overflow: "hidden",
    padding: 13,
    justifyContent: "flex-end",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  roomImage: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
  },
  roomShade: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  roomTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
    zIndex: 2,
  },
  roomSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
    zIndex: 2,
  },
  albumCard: {
    borderRadius: 22,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  albumArt: {
    width: "100%",
    height: 148,
    borderRadius: 18,
    backgroundColor: COLORS.card,
  },
  creatorCard: {
    borderRadius: 22,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  creatorArt: {
    width: "100%",
    height: 132,
    borderRadius: 18,
    backgroundColor: COLORS.card,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 10,
  },
  cardSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  worldsSection: {
    marginTop: 16,
    opacity: 0.78,
  },
  galleryWrap: {
    marginTop: 12,
    opacity: 0.72,
  },
});
