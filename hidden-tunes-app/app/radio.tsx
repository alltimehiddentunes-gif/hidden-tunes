import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import { COLORS, GRADIENTS } from "../constants/theme";
import { usePlayer } from "../context/PlayerContext";

import {
  searchYouTubeBackend,
  type BackendYouTubeTrack,
} from "../services/youtubeBackend";

import {
  searchHiddenTunesSongs,
  type HiddenTunesNormalizedSong,
} from "../services/hiddenTunesApi";

import {
  guessGenreFromText,
  guessMoodFromText,
} from "../services/musicNormalizer";
import { FALLBACK_ARTWORK } from "../utils/artwork";
import {
  logTapToPlay,
  startPerformanceTimer,
} from "../utils/performanceLogs";

type RadioTrack = HiddenTunesNormalizedSong | BackendYouTubeTrack;

function cleanQuery(value: string) {
  return String(value || "")
    .replace(/\s+music$/i, "")
    .replace(/\s+songs$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getArtwork(song: any) {
  return (
    song?.artwork ||
    song?.cover ||
    song?.thumbnail ||
    song?.image ||
    FALLBACK_ARTWORK
  );
}

function safeSong(song: any): HiddenTunesNormalizedSong {
  const artwork = getArtwork(song);
  const streamUrl = String(song?.streamUrl || song?.url || song?.audioUrl || "");

  return {
    ...song,
    id: String(song?.id || `${song?.title || "song"}-${song?.artist || "artist"}`),
    title: String(song?.title || "Unknown Song"),
    artist: String(song?.artist || song?.user?.name || "Hidden Tunes"),
    album: song?.album || "Singles",
    artwork,
    cover: artwork,
    thumbnail: artwork,
    url: String(song?.url || streamUrl),
    streamUrl,
    sourceName: "Hidden Tunes",
    type: "r2",
    isOnline: true,
  } as HiddenTunesNormalizedSong;
}

function dedupeSongs(songs: HiddenTunesNormalizedSong[]) {
  const seen = new Set<string>();

  return songs.filter((song) => {
    const key = String(song.id || song.streamUrl || song.url).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return Boolean(song.streamUrl || song.url);
  });
}

function sanitizeYouTubeVideoId(value: any) {
  const text = String(value || "").replace("youtube-", "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;
  const match = text.match(/[a-zA-Z0-9_-]{11}/);
  return match ? match[0] : "";
}

function getTrackVideoId(track: Partial<BackendYouTubeTrack>) {
  return sanitizeYouTubeVideoId(track.videoId || track.id);
}

function getTrackArtist(track: Partial<BackendYouTubeTrack>) {
  return String(track.artist || track.channelTitle || "Unknown Artist");
}

function getTrackThumbnail(track: Partial<BackendYouTubeTrack>) {
  return String(
    track.thumbnail || track.artwork || track.cover || FALLBACK_ARTWORK
  );
}

function normalizeYouTubeTrack(
  track: Partial<BackendYouTubeTrack>
): BackendYouTubeTrack | null {
  const videoId = getTrackVideoId(track);
  if (!videoId) return null;

  const artist = getTrackArtist(track);
  const thumbnail = getTrackThumbnail(track);

  return {
    id: `youtube-${videoId}`,
    videoId,
    title: String(track.title || "YouTube Music"),
    artist,
    channelTitle: String(track.channelTitle || artist),
    thumbnail,
    artwork: thumbnail,
    cover: thumbnail,
    sourceName: "YouTube",
    source: "youtube",
    type: "youtube_video",
    isYouTube: true,
    isOnline: true,
    duration: track.duration,
    url: track.url,
    streamUrl: track.streamUrl,
  };
}

function dedupeYouTubeTracks(tracks: Partial<BackendYouTubeTrack>[]) {
  const seen = new Set<string>();
  const cleanTracks: BackendYouTubeTrack[] = [];

  tracks.forEach((track) => {
    const normalized = normalizeYouTubeTrack(track);
    const videoId = normalized?.videoId || "";

    if (!normalized || !videoId) return;
    if (seen.has(videoId)) return;

    seen.add(videoId);
    cleanTracks.push(normalized);
  });

  return cleanTracks;
}

export default function RadioScreen() {
  const params = useLocalSearchParams();
  const { playSong } = usePlayer() as any;

  const title = String(params.title || "Hidden Tunes Radio");
  const artist = String(params.artist || "");
  const genre = String(params.genre || "");
  const mood = String(params.mood || "");

  const query = cleanQuery(
    String(params.query || `${artist || title} ${genre || ""} ${mood || ""}`)
  );

  const [cloudTracks, setCloudTracks] = useState<HiddenTunesNormalizedSong[]>([]);
  const [youtubeTracks, setYoutubeTracks] = useState<BackendYouTubeTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusText, setStatusText] = useState("Curating your station...");

  const radioGenre = useMemo(() => {
    return genre || guessGenreFromText(`${title} ${artist} ${query}`);
  }, [genre, title, artist, query]);

  const radioMood = useMemo(() => {
    return mood || guessMoodFromText(`${title} ${artist} ${query}`);
  }, [mood, title, artist, query]);

  useEffect(() => {
    loadRadio();
  }, [query, artist, genre, mood]);

  async function loadRadio() {
    try {
      setLoading(true);
      setStatusText("Finding tracks for you...");

      const searchQueries = Array.from(
        new Set(
          [
            query,
            title,
            artist,
            genre,
            mood,
            radioGenre,
            radioMood,
            query.replace(/&/g, "and"),
          ]
            .map((item) => cleanQuery(String(item || "")))
            .filter(Boolean)
        )
      );

      let combinedCloudSongs: HiddenTunesNormalizedSong[] = [];

      for (const searchTerm of searchQueries) {
        const results = await searchHiddenTunesSongs(searchTerm);

        if (Array.isArray(results)) {
          combinedCloudSongs = [...combinedCloudSongs, ...results.map(safeSong)];
        }
      }

      const uniqueCloudSongs = dedupeSongs(combinedCloudSongs);

      setCloudTracks(uniqueCloudSongs);

      if (uniqueCloudSongs.length > 0) {
        setYoutubeTracks([]);
        setStatusText(`${uniqueCloudSongs.length} tracks ready`);
        return;
      }

      setStatusText("Expanding your station...");

      const youtubeQueries = [
        `${query} music`,
        artist ? `${artist} songs` : "",
        genre ? `${genre} music` : "",
      ].filter(Boolean);

      const responses = await Promise.all(
        youtubeQueries.slice(0, 3).map((item) => searchYouTubeBackend(item))
      );

      const merged = responses.flat().filter(Boolean);
      const uniqueYouTube = dedupeYouTubeTracks(merged);

      setYoutubeTracks(uniqueYouTube);
      setStatusText(
        uniqueYouTube.length > 0
          ? `${uniqueYouTube.length} TV videos ready`
          : "No tracks found for this vibe"
      );
    } catch {
      setCloudTracks([]);
      setYoutubeTracks([]);
      setStatusText("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function openCloudTrack(song: HiddenTunesNormalizedSong, index: number) {
    try {
      const tapStartedAt = startPerformanceTimer();
      const queue = dedupeSongs(cloudTracks.map(safeSong));
      const normalized = safeSong(song);

      void playSong(normalized as any, queue as any, index)
        .finally(() => {
          logTapToPlay("radio", tapStartedAt, { id: normalized.id });
        })
        .catch((error: unknown) => {
          if (__DEV__) console.log("Radio play error:", error);
        });

      requestAnimationFrame(() => {
        router.push("/player" as any);
      });
    } catch {}
  }

  function openYouTubeTrack(track: BackendYouTubeTrack, index: number) {
    const videoId = getTrackVideoId(track);

    if (!videoId) return;

    const queue = youtubeTracks
      .map((item) => ({
        id: getTrackVideoId(item),
        videoId: getTrackVideoId(item),
        title: String(item.title || "YouTube Music"),
        artist: getTrackArtist(item),
        channelTitle: String(item.channelTitle || getTrackArtist(item)),
        thumbnail: getTrackThumbnail(item),
      }))
      .filter((item) => item.videoId.length === 11);

    router.push({
      pathname: "/youtube-player",
      params: {
        id: videoId,
        videoId,
        title: track.title || "YouTube Music",
        artist: getTrackArtist(track),
        channelTitle: String(track.channelTitle || getTrackArtist(track)),
        thumbnail: getTrackThumbnail(track),
        startIndex: String(index),
        queue: JSON.stringify(queue),
      },
    } as any);
  }

  function playRadio() {
    if (cloudTracks[0]) {
      openCloudTrack(cloudTracks[0], 0);
      return;
    }

    if (youtubeTracks[0]) {
      openYouTubeTrack(youtubeTracks[0], 0);
    }
  }

  const hasCloudSongs = cloudTracks.length > 0;
  const activeTracks: RadioTrack[] = hasCloudSongs ? cloudTracks : youtubeTracks;

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Hidden Radio</Text>
          <Text style={styles.headerSub}>
            {hasCloudSongs ? "Music queue" : "Discovery queue"}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={loadRadio}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh" size={21} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.hero}>
        <View style={styles.glow} />

        <View style={styles.radioCircle}>
          <Ionicons name="radio" size={72} color={COLORS.primary} />
        </View>

        <Text style={styles.kicker}>DISCOVERY RADIO</Text>

        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        <Text style={styles.subtitle} numberOfLines={1}>
          {query}
        </Text>

        <View style={styles.metaRowCenter}>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>{radioGenre}</Text>
          </View>

          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>{radioMood}</Text>
          </View>
        </View>

        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText} numberOfLines={1}>
            {statusText}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.86}
          style={[
            styles.playButton,
            activeTracks.length === 0 && styles.disabledPlayButton,
          ]}
          disabled={activeTracks.length === 0}
          onPress={playRadio}
        >
          <Ionicons name="play" size={18} color="#000" />
          <Text style={styles.playButtonText}>Start Radio</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Curating your station...</Text>
        </View>
      ) : (
        <FlatList<RadioTrack>
          data={activeTracks}
          keyExtractor={(item, index) => {
            const videoId = "videoId" in item ? item.videoId : "";
            return `${item.id || videoId || "radio"}-${index}`;
          }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Radio Queue</Text>
                <Text style={styles.sectionSub}>
                  {hasCloudSongs
                    ? `${cloudTracks.length} Hidden Tunes songs`
                    : `${youtubeTracks.length} TV videos`}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.smallRefresh}
                onPress={loadRadio}
                activeOpacity={0.85}
              >
                <Ionicons name="shuffle" size={17} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name="radio-outline"
                size={58}
                color={COLORS.textMuted}
              />
              <Text style={styles.emptyTitle}>No radio tracks found</Text>
              <Text style={styles.emptyText}>
                Try another genre or tap refresh.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const artwork = hasCloudSongs
              ? getArtwork(item)
              : getTrackThumbnail(item as BackendYouTubeTrack);

            return (
              <TouchableOpacity
                activeOpacity={0.86}
                style={styles.trackCard}
                onPress={() =>
                  hasCloudSongs
                    ? openCloudTrack(item as HiddenTunesNormalizedSong, index)
                    : openYouTubeTrack(item as BackendYouTubeTrack, index)
                }
              >
                <Text style={styles.rank}>
                  {String(index + 1).padStart(2, "0")}
                </Text>

                <Image source={{ uri: artwork }} style={styles.cover} />

                <View style={styles.info}>
                  <Text style={styles.trackTitle} numberOfLines={1}>
                    {item.title || "Unknown Song"}
                  </Text>

                  <Text style={styles.artist} numberOfLines={1}>
                    {hasCloudSongs
                      ? item.artist
                      : getTrackArtist(item as BackendYouTubeTrack)}
                  </Text>

                  <View style={styles.metaRow}>
                    <Ionicons
                      name={hasCloudSongs ? "cloud-done" : "tv"}
                      size={13}
                      color={hasCloudSongs ? COLORS.primary : "#ff3b30"}
                    />
                    <Text style={styles.metaText}>
                      {hasCloudSongs ? "Hidden Tunes" : "Hidden Tunes TV"}
                    </Text>
                  </View>
                </View>

                <View style={styles.playCircle}>
                  <Ionicons name="play" size={16} color={COLORS.text} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingTop: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  headerCenter: { alignItems: "center" },

  headerTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
  },

  headerSub: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },

  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  hero: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 26,
  },

  glow: {
    position: "absolute",
    top: 10,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(34,197,94,0.12)",
  },

  radioCircle: {
    width: 172,
    height: 172,
    borderRadius: 86,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 22,
  },

  title: {
    color: COLORS.text,
    fontSize: 32,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 38,
  },

  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 8,
  },

  metaRowCenter: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },

  metaPill: {
    paddingHorizontal: 12,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(34,197,94,0.13)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },

  metaPillText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
  },

  statusPill: {
    marginTop: 13,
    maxWidth: "92%",
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 13,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    alignItems: "center",
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginRight: 8,
  },

  statusText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },

  playButton: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 999,
  },

  disabledPlayButton: { opacity: 0.45 },

  playButtonText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "900",
    marginLeft: 8,
  },

  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: COLORS.textMuted,
    marginTop: 14,
  },

  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 165,
  },

  sectionHeader: {
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },

  sectionSub: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 5,
  },

  smallRefresh: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(34,197,94,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.2)",
  },

  trackCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 26,
    marginBottom: 14,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },

  rank: {
    width: 30,
    color: "rgba(255,255,255,0.32)",
    fontSize: 15,
    fontWeight: "900",
  },

  cover: {
    width: 66,
    height: 66,
    borderRadius: 18,
    backgroundColor: COLORS.card,
  },

  info: {
    flex: 1,
    marginLeft: 14,
  },

  trackTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },

  artist: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 5,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },

  metaText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 5,
  },

  playCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  empty: {
    height: 280,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 18,
  },

  emptyText: {
    color: COLORS.textMuted,
    marginTop: 8,
    textAlign: "center",
  },
});
