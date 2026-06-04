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

type ExploreMoodRoom = MoodRoomGroup<HiddenTunesSong>;

type DiscoveryRoom = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  terms: string[];
  songs: HiddenTunesSong[];
  artwork: string;
  type: "room" | "station" | "genre";
};

const EMPTY_CATALOG: HiddenTunesDerivedCatalog = {
  songs: [],
  artists: [],
  albums: [],
  genres: [],
  playlists: [],
};

const ROOM_DEFINITIONS = [
  {
    id: "listening-room",
    eyebrow: "LISTENING ROOM",
    title: "Listening Rooms",
    subtitle: "Step into a curated Hidden Tunes session",
    icon: "radio" as const,
    terms: ["session", "room", "hidden", "soul", "live", "worship", "calm"],
    type: "room" as const,
  },
  {
    id: "country-station",
    eyebrow: "COUNTRY STATION",
    title: "Country Station",
    subtitle: "Story-led songs and open-road warmth",
    icon: "trail-sign" as const,
    terms: ["country", "folk", "acoustic", "guitar", "road", "home"],
    type: "station" as const,
  },
  {
    id: "calm-instrumentals",
    eyebrow: "CALM INSTRUMENTALS",
    title: "Calm Instrumentals",
    subtitle: "Soft focus, prayer, piano, and quiet space",
    icon: "leaf" as const,
    terms: ["calm", "instrumental", "ambient", "piano", "peace", "quiet", "soft"],
    type: "room" as const,
  },
  {
    id: "afrobeats",
    eyebrow: "AFROBEATS",
    title: "Afrobeats",
    subtitle: "Movement, rhythm, and bright percussion",
    icon: "sunny" as const,
    terms: ["afro", "afrobeats", "afrobeat", "dance", "beat", "party"],
    type: "genre" as const,
  },
  {
    id: "jazz",
    eyebrow: "JAZZ",
    title: "Jazz",
    subtitle: "Late-night chords and lounge energy",
    icon: "musical-notes" as const,
    terms: ["jazz", "lounge", "sax", "soul", "smooth"],
    type: "genre" as const,
  },
  {
    id: "blues",
    eyebrow: "BLUES",
    title: "Blues",
    subtitle: "Grit, testimony, guitar, and ache",
    icon: "moon" as const,
    terms: ["blues", "blue", "guitar", "soul", "deep"],
    type: "genre" as const,
  },
  {
    id: "amapiano",
    eyebrow: "AMAPIANO",
    title: "Amapiano",
    subtitle: "Log drums, pulse, and South African heat",
    icon: "pulse" as const,
    terms: ["amapiano", "piano", "south africa", "log drum", "dance"],
    type: "genre" as const,
  },
];

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

function findSongIndex(songs: HiddenTunesSong[], song: { id?: string }) {
  const id = String(song?.id || "");
  return songs.findIndex((candidate) => String(candidate.id) === id);
}

function buildDiscoveryRoom(definition: (typeof ROOM_DEFINITIONS)[number], songs: HiddenTunesSong[]) {
  const matches = songs.filter((song) => {
    const text = songSearchText(song);
    return definition.terms.some((term) => text.includes(term.toLowerCase()));
  });
  const roomSongs = uniqSongs(matches).slice(0, 24);
  const fallback = songs.find((song) => getArtwork(song)) || songs[0];
  const first = roomSongs.find((song) => getArtwork(song)) || roomSongs[0] || fallback;

  return {
    ...definition,
    songs: roomSongs.length ? roomSongs : uniqSongs(songs).slice(0, 12),
    artwork: getArtwork(first),
  } satisfies DiscoveryRoom;
}

function getGenreArtwork(genre: HiddenTunesGenreCatalogItem) {
  return genre.artwork || getArtwork(genre.songs?.[0]);
}

export default function WorldsIndexScreen() {
  const { width: viewportWidth } = useWindowDimensions();
  const compactLayout = viewportWidth < 380;
  const horizontalPadding = compactLayout ? 16 : 18;
  const heroWidth = Math.min(420, Math.max(300, viewportWidth - horizontalPadding * 2));
  const featureCardWidth = Math.min(250, Math.max(206, viewportWidth * 0.62));
  const albumCardWidth = Math.min(220, Math.max(176, viewportWidth * 0.52));
  const creatorCardWidth = Math.min(184, Math.max(154, viewportWidth * 0.44));
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

  const discoveryRooms = useMemo(
    () => ROOM_DEFINITIONS.map((definition) => buildDiscoveryRoom(definition, songs)),
    [songs]
  );

  const listeningRooms = useMemo(
    () => discoveryRooms.filter((room) => ["listening-room", "calm-instrumentals"].includes(room.id)),
    [discoveryRooms]
  );

  const stationRooms = useMemo(
    () => discoveryRooms.filter((room) => !["listening-room", "calm-instrumentals"].includes(room.id)),
    [discoveryRooms]
  );

  const countryStation = useMemo(
    () => discoveryRooms.find((room) => room.id === "country-station") || discoveryRooms[0],
    [discoveryRooms]
  );

  const visibleGenres = useMemo(() => {
    const preferredNames = ["afrobeats", "jazz", "blues", "amapiano", "gospel", "soul"];
    const preferred = preferredNames
      .map((name) => genres.find((genre) => String(genre.title || "").toLowerCase().includes(name)))
      .filter(Boolean) as HiddenTunesGenreCatalogItem[];
    const remaining = genres.filter((genre) => !preferred.some((item) => item.id === genre.id));
    return [...preferred, ...remaining].slice(0, 10);
  }, [genres]);

  const deepAlbums = useMemo(() => albums.slice(0, 10), [albums]);
  const deepCuts = useMemo(() => uniqSongs(songs.slice(12, 36)).slice(0, 8), [songs]);
  const visibleArtists = useMemo(() => artists.slice(0, 12), [artists]);

  const continueTracks = useMemo(() => {
    if (!Array.isArray(recentlyPlayed) || recentlyPlayed.length === 0) return [] as HiddenTunesSong[];

    const resolved = recentlyPlayed
      .map((entry) => songs.find((song) => String(song.id) === String(entry?.id)))
      .filter(Boolean) as HiddenTunesSong[];
    const currentMatch = currentSong?.id
      ? songs.find((song) => String(song.id) === String(currentSong.id))
      : null;

    return uniqSongs([...(currentMatch ? [currentMatch] : []), ...resolved]).slice(0, 6);
  }, [currentSong?.id, recentlyPlayed, songs]);

  const playQueue = useCallback(
    (song: HiddenTunesSong, queueSongs: HiddenTunesSong[], label: string, source: "mood" | "genre" | "full_catalog") => {
      const queue = queueSongs.length ? queueSongs : songs;
      const index = findSongIndex(queue, song);
      const queueSong = index >= 0 ? queue[index] : song;
      void playSong(queueSong, queue, Math.max(index, 0), {
        source,
        label,
        artistName: queueSong.artist,
        genre: queueSong.genre,
        mood: queueSong.mood,
      });
    },
    [playSong, songs]
  );

  const playRoom = useCallback(
    (room: DiscoveryRoom) => {
      const first = room.songs[0] || songs[0];
      if (!first) return;
      playQueue(first, room.songs, room.title, room.type === "genre" ? "genre" : "mood");
    },
    [playQueue, songs]
  );

  const openRoom = useCallback((room: DiscoveryRoom) => {
    router.push({
      pathname: "/genre",
      params: {
        id: room.id,
        title: room.title,
        query: room.title,
        type: room.type === "genre" ? "genre" : "mood",
      },
    } as any);
  }, []);

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

  const openArtist = useCallback((artist: HiddenTunesArtistCatalogItem) => {
    router.push({ pathname: "/artist", params: { artist: artist.name } } as any);
  }, []);

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <View style={styles.glowPurple} />
        <View style={styles.glowCyan} />
        <View style={styles.glowCenter} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding }]}
        >
          <View style={styles.topBar}>
            <View style={styles.heroCopy}>
              <Text style={styles.kicker}>EXPLORE</Text>
              <Text style={styles.title}>Discovery</Text>
              <Text style={styles.subtitle}>Listening rooms, moods, stations, albums, and creators.</Text>
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
              {countryStation ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.featureHero, { width: heroWidth }]}
                  onPress={() => openRoom(countryStation)}
                >
                  <HTImage source={countryStation.artwork || countryStation.songs[0]} style={styles.featureHeroImage} contentFit="cover" />
                  <LinearGradient
                    pointerEvents="none"
                    colors={["transparent", "rgba(0,0,0,0.18)", "rgba(0,0,0,0.82)"]}
                    style={styles.featureShade}
                  />
                  <View style={styles.featureContent}>
                    <View style={styles.featureBadge}>
                      <Ionicons name={countryStation.icon} size={13} color={COLORS.cyan} />
                      <Text style={styles.featureBadgeText}>{countryStation.eyebrow}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.featureTitle}>{countryStation.title}</Text>
                    <Text numberOfLines={2} style={styles.featureSubtitle}>{countryStation.subtitle}</Text>
                    <TouchableOpacity
                      activeOpacity={0.88}
                      style={styles.featurePlay}
                      onPress={() => playRoom(countryStation)}
                    >
                      <Ionicons name="play" size={16} color="#000" />
                      <Text style={styles.featurePlayText}>Start Station</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ) : null}

              {continueTracks.length > 0 ? (
                <View style={styles.continueStrip}>
                  <Text style={styles.sectionEyebrow}>NOW TUNED</Text>
                  <Text style={styles.sectionTitle}>{isPlaying ? "Keep Listening" : "Recent Rooms"}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.mediaRail, { gap: railGap }]}>
                    {continueTracks.map((song) => (
                      <TouchableOpacity
                        key={`continue-${song.id}`}
                        activeOpacity={0.88}
                        style={styles.continueTile}
                        onPress={() => playQueue(song, continueTracks, "Continue Listening", "full_catalog")}
                      >
                        <HTImage source={song} style={styles.continueArt} contentFit="cover" />
                        <Text numberOfLines={1} style={styles.cardTitle}>{song.title}</Text>
                        <Text numberOfLines={1} style={styles.cardSubtitle}>{song.artist}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {listeningRooms.length > 0 ? (
                <View style={styles.cinematicSection}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>LISTENING ROOMS</Text>
                      <Text style={styles.sectionTitle}>Rooms To Enter</Text>
                    </View>
                    <Text style={styles.sectionMeta}>{songs.length.toLocaleString()} tracks</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.roomRail, { gap: railGap, paddingRight: horizontalPadding }]}>
                    {listeningRooms.map((room) => (
                      <TouchableOpacity
                        key={room.id}
                        activeOpacity={0.9}
                        style={[styles.roomCard, { width: featureCardWidth }]}
                        onPress={() => openRoom(room)}
                      >
                        <HTImage source={room.artwork || room.songs[0]} style={styles.roomImage} contentFit="cover" />
                        <LinearGradient pointerEvents="none" colors={["transparent", "rgba(0,0,0,0.78)"]} style={styles.roomShade} />
                        <View style={styles.roomCopy}>
                          <View style={styles.roomIconRow}>
                            <Ionicons name={room.icon} size={15} color={COLORS.primaryGlow} />
                            <Text style={styles.roomEyebrow}>{room.eyebrow}</Text>
                          </View>
                          <Text numberOfLines={1} style={styles.roomTitle}>{room.title}</Text>
                          <Text numberOfLines={1} style={styles.roomSubtitle}>{room.subtitle}</Text>
                        </View>
                        <TouchableOpacity activeOpacity={0.86} style={styles.roomPlayButton} onPress={() => playRoom(room)}>
                          <Ionicons name="play" size={14} color="#000" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {moodRooms.length > 0 ? (
                <View style={styles.cinematicSection}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>MOOD ROOMS</Text>
                      <Text style={styles.sectionTitle}>Mood First</Text>
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

              {stationRooms.length > 0 ? (
                <View style={styles.cinematicSection}>
                  <Text style={styles.sectionEyebrow}>GENRE SPOTLIGHTS</Text>
                  <Text style={styles.sectionTitle}>Stations And Scenes</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.mediaRail, { gap: railGap, paddingRight: horizontalPadding }]}>
                    {stationRooms.map((room) => (
                      <TouchableOpacity
                        key={room.id}
                        activeOpacity={0.9}
                        style={[styles.stationCard, { width: featureCardWidth }]}
                        onPress={() => openRoom(room)}
                      >
                        <HTImage source={room.artwork || room.songs[0]} style={styles.stationArt} contentFit="cover" />
                        <View style={styles.stationCopy}>
                          <View style={styles.stationIcon}>
                            <Ionicons name={room.icon} size={17} color={COLORS.cyan} />
                          </View>
                          <Text numberOfLines={1} style={styles.cardTitle}>{room.title}</Text>
                          <Text numberOfLines={2} style={styles.cardSubtitle}>{room.subtitle}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {visibleGenres.length > 0 ? (
                <View style={styles.cinematicSection}>
                  <Text style={styles.sectionEyebrow}>GENRES</Text>
                  <Text style={styles.sectionTitle}>Genre Spotlights</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.mediaRail, { gap: railGap, paddingRight: horizontalPadding }]}>
                    {visibleGenres.map((genre) => (
                      <TouchableOpacity
                        key={genre.id}
                        activeOpacity={0.88}
                        style={[styles.genreSpotlight, { width: albumCardWidth }]}
                        onPress={() => openGenre(genre)}
                      >
                        <HTImage source={getGenreArtwork(genre)} style={styles.genreArt} contentFit="cover" />
                        <Text numberOfLines={1} style={styles.cardTitle}>{genre.title}</Text>
                        <Text style={styles.cardSubtitle}>{genre.songs.length} song{genre.songs.length === 1 ? "" : "s"}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {(deepAlbums.length > 0 || deepCuts.length > 0) ? (
                <View style={styles.cinematicSection}>
                  <Text style={styles.sectionEyebrow}>DEEP CUTS AND ALBUMS</Text>
                  <Text style={styles.sectionTitle}>Stay Awhile</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.mediaRail, { gap: railGap, paddingRight: horizontalPadding }]}>
                    {deepAlbums.map((album) => (
                      <TouchableOpacity
                        key={`album-${album.id}`}
                        activeOpacity={0.88}
                        style={[styles.albumCard, { width: albumCardWidth }]}
                        onPress={() => openAlbum(album)}
                      >
                        <HTImage source={album.artwork} style={styles.albumArt} contentFit="cover" />
                        <Text numberOfLines={1} style={styles.cardTitle}>{album.title}</Text>
                        <Text numberOfLines={1} style={styles.cardSubtitle}>{album.artist}</Text>
                      </TouchableOpacity>
                    ))}
                    {deepCuts.map((song) => (
                      <TouchableOpacity
                        key={`deep-${song.id}`}
                        activeOpacity={0.88}
                        style={[styles.albumCard, { width: albumCardWidth }]}
                        onPress={() => playQueue(song, deepCuts, "Deep Cuts", "full_catalog")}
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
                <View style={styles.cinematicSection}>
                  <Text style={styles.sectionEyebrow}>CREATORS TO FOLLOW</Text>
                  <Text style={styles.sectionTitle}>Creators</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.mediaRail, { gap: railGap, paddingRight: horizontalPadding }]}>
                    {visibleArtists.map((artist) => (
                      <TouchableOpacity
                        key={artist.id}
                        activeOpacity={0.88}
                        style={[styles.creatorCard, { width: creatorCardWidth }]}
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
    paddingTop: 48,
  },
  scrollContent: {
    paddingBottom: 156,
  },
  glowPurple: {
    position: "absolute",
    top: -38,
    left: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(168,85,247,0.18)",
  },
  glowCyan: {
    position: "absolute",
    top: 280,
    right: -130,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(34,211,238,0.08)",
  },
  glowCenter: {
    position: "absolute",
    top: 118,
    alignSelf: "center",
    width: 240,
    height: 190,
    borderRadius: 120,
    backgroundColor: "rgba(168,85,247,0.12)",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 18,
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
    fontSize: 34,
    fontWeight: "900",
    marginTop: 4,
    letterSpacing: 0,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    marginTop: 6,
    maxWidth: 280,
  },
  refreshButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(34,211,238,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.22)",
  },
  loadingBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 42,
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 10,
    fontWeight: "700",
  },
  featureHero: {
    alignSelf: "center",
    height: 356,
    borderRadius: 34,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: "rgba(168,85,247,0.46)",
    shadowColor: COLORS.primaryGlow,
    shadowOpacity: 0.24,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  featureHeroImage: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
  },
  featureShade: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
  },
  featureContent: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
  },
  featureBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 9,
  },
  featureBadgeText: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  featureTitle: {
    color: COLORS.text,
    fontSize: 27,
    fontWeight: "900",
    lineHeight: 32,
  },
  featureSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "800",
    marginTop: 5,
    maxWidth: 280,
  },
  featurePlay: {
    marginTop: 14,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  featurePlayText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "900",
  },
  continueStrip: {
    marginTop: 20,
  },
  cinematicSection: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  sectionEyebrow: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.7,
    marginBottom: 4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0,
  },
  sectionMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  roomRail: {
    paddingRight: 18,
  },
  mediaRail: {
    paddingRight: 18,
    paddingBottom: 2,
  },
  roomCard: {
    height: 214,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  roomImage: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
  },
  roomShade: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
  },
  roomCopy: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
  },
  roomIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 7,
  },
  roomEyebrow: {
    color: COLORS.primaryGlow,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  roomTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "900",
  },
  roomSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  roomPlayButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  moodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  stationCard: {
    minHeight: 244,
    borderRadius: 26,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  stationArt: {
    width: "100%",
    height: 154,
    borderRadius: 21,
    backgroundColor: COLORS.card,
  },
  stationCopy: {
    paddingHorizontal: 2,
    paddingTop: 10,
  },
  stationIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34,211,238,0.1)",
    marginBottom: 8,
  },
  genreSpotlight: {
    borderRadius: 24,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  genreArt: {
    width: "100%",
    height: 136,
    borderRadius: 20,
    backgroundColor: COLORS.card,
  },
  albumCard: {
    borderRadius: 24,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  albumArt: {
    width: "100%",
    height: 146,
    borderRadius: 20,
    backgroundColor: COLORS.card,
  },
  creatorCard: {
    borderRadius: 24,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  creatorArt: {
    width: "100%",
    height: 134,
    borderRadius: 20,
    backgroundColor: COLORS.card,
  },
  continueTile: {
    width: 154,
    borderRadius: 22,
    padding: 9,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  continueArt: {
    width: "100%",
    height: 116,
    borderRadius: 18,
    backgroundColor: COLORS.card,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 9,
  },
  cardSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
    lineHeight: 16,
  },
});
