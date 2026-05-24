import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import NeonEQ from "../../components/NeonEQ";
import { COLORS, GRADIENTS } from "../../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "../../context/PlayerContext";

function sanitizeYouTubeVideoId(value: any) {
  const text = String(value || "").replace("youtube-", "").trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;

  const match = text.match(/[a-zA-Z0-9_-]{11}/);
  return match ? match[0] : "";
}

export default function FavoritesScreen() {
  const { playAudiusTrack, toggleFavorite } = usePlayerActions();
  const { favorites } = usePlayerState();
  const { currentSong, isPlaying } = usePlayerNowPlaying();

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />

      <Text style={styles.title}>Library</Text>
      <Text style={styles.subtitle}>Saved sounds</Text>

      {favorites.length === 0 ? (
        <View style={styles.emptyBox}>
          <View style={styles.emptyIcon}>
            <Ionicons name="heart-outline" size={54} color={COLORS.primary} />
          </View>

          <Text style={styles.emptyTitle}>No favorites yet</Text>
          <Text style={styles.emptyText}>Save songs you love here.</Text>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item, index) =>
            item.id ? `favorite-${item.id}-${index}` : `favorite-${index}`
          }
          contentContainerStyle={{ paddingBottom: 180 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isYouTube =
              item.type === "youtube_video" ||
              item.source === "youtube" ||
              item.sourceName === "YouTube" ||
              Boolean(item.videoId);

            const active = currentSong?.id === item.id && !isYouTube;

            const videoId = sanitizeYouTubeVideoId(item.videoId || item.id);

            const artist =
              item.artist ||
              item.user?.name ||
              item.channelTitle ||
              "Unknown Artist";

            const thumbnail =
              typeof item.thumbnail === "string"
                ? item.thumbnail
                : typeof item.cover === "string"
                ? item.cover
                : typeof item.artwork === "string"
                ? item.artwork
                : "";

            const coverSource =
              typeof item.cover === "string"
                ? { uri: item.cover }
                : typeof item.thumbnail === "string"
                ? { uri: item.thumbnail }
                : item.cover;

            function openFavorite() {
              if (isYouTube) {
                if (!videoId) {
                  console.log("Missing YouTube favorite videoId:", item);
                  return;
                }

                router.push({
                  pathname: "/youtube-player",
                  params: {
                    id: videoId,
                    videoId,
                    title: item.title || "YouTube Music",
                    artist,
                    channelTitle: item.channelTitle || artist,
                    thumbnail,
                  },
                } as any);

                return;
              }

              playAudiusTrack(item);
            }

            return (
              <TouchableOpacity
                style={[styles.songRow, active && styles.activeRow]}
                activeOpacity={0.85}
                onPress={openFavorite}
              >
                <LinearGradient colors={GRADIENTS.neon} style={styles.coverBorder}>
                  <Image source={coverSource} style={styles.cover} />
                </LinearGradient>

                <View style={styles.songInfo}>
                  <View style={styles.badgeRow}>
                    {isYouTube ? (
                      <>
                        <Ionicons name="tv" size={13} color="#ff0033" />
                        <Text style={styles.badgeText}>Hidden Tunes TV</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons
                          name="musical-notes"
                          size={13}
                          color={COLORS.primary}
                        />
                        <Text style={styles.badgeText}>
                          {item.sourceName || "Music"}
                        </Text>
                      </>
                    )}
                  </View>

                  <Text
                    numberOfLines={1}
                    style={[styles.songTitle, active && styles.activeText]}
                  >
                    {item.title}
                  </Text>

                  <Text numberOfLines={1} style={styles.songArtist}>
                    {artist}
                  </Text>
                </View>

                {active ? (
                  <NeonEQ isPlaying={isPlaying} size="small" />
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => toggleFavorite(item)}
                  >
                    <Ionicons name="heart" size={24} color={COLORS.pink} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
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
    top: 260,
    right: -130,
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: "rgba(34,211,238,0.12)",
  },

  title: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: "900",
  },

  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 6,
    marginBottom: 24,
    fontWeight: "700",
  },

  emptyBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 140,
  },

  emptyIcon: {
    width: 126,
    height: 126,
    borderRadius: 63,
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
    marginTop: 18,
  },

  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
    fontWeight: "700",
  },

  songRow: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 24,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  activeRow: {
    borderColor: "rgba(168,85,247,0.55)",
    backgroundColor: "rgba(168,85,247,0.12)",
  },

  coverBorder: {
    width: 68,
    height: 68,
    borderRadius: 20,
    padding: 2,
  },

  cover: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
    backgroundColor: COLORS.cardLight,
  },

  songInfo: {
    flex: 1,
    marginLeft: 14,
  },

  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
  },

  badgeText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "900",
    marginLeft: 5,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  songTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },

  activeText: {
    color: COLORS.primary,
  },

  songArtist: {
    color: COLORS.textMuted,
    marginTop: 5,
    fontSize: 13,
    fontWeight: "700",
  },
});
