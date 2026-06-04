import { useCallback, useMemo } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import AppShell from "../components/navigation/AppShell";
import HTImage from "../components/HTImage";
import NeonEQ from "../components/NeonEQ";
import { COLORS, GRADIENTS } from "../constants/theme";
import PremiumEmptyState from "../components/PremiumEmptyState";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "../context/PlayerContext";

type FavoriteItem = {
  id?: string;
  title?: string;
  artist?: string;
  type?: string;
  source?: string;
  sourceName?: string;
  videoId?: string;
  channelTitle?: string;
  thumbnail?: string;
  cover?: string;
  artwork?: string;
  user?: { name?: string };
};

function sanitizeYouTubeVideoId(value: unknown) {
  const text = String(value || "").replace("youtube-", "").trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;

  const match = text.match(/[a-zA-Z0-9_-]{11}/);
  return match ? match[0] : "";
}

function isYouTubeFavorite(item: FavoriteItem) {
  return (
    item.type === "youtube_video" ||
    item.source === "youtube" ||
    item.sourceName === "YouTube" ||
    Boolean(item.videoId)
  );
}

type LibraryShortcut = {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: "/playlists" | "/recently-played" | "/music-feed";
};

const LIBRARY_SHORTCUTS: LibraryShortcut[] = [
  {
    label: "Playlists",
    description: "Smart and saved playlists",
    icon: "albums-outline",
    href: "/playlists",
  },
  {
    label: "Recently Played",
    description: "Your listening history",
    icon: "time-outline",
    href: "/recently-played",
  },
  {
    label: "Explore Music",
    description: "Discover more to save",
    icon: "sparkles-outline",
    href: "/music-feed",
  },
];

export default function FavoritesScreen() {
  const { playSong, toggleFavorite } = usePlayerActions();
  const { favorites } = usePlayerState();
  const { currentSong, isPlaying } = usePlayerNowPlaying();

  const favoriteSongs = useMemo(
    () => (Array.isArray(favorites) ? favorites : []) as FavoriteItem[],
    [favorites]
  );

  const playFavorite = useCallback(
    (item: FavoriteItem, index: number) => {
      if (isYouTubeFavorite(item)) {
        const videoId = sanitizeYouTubeVideoId(item.videoId || item.id);
        if (!videoId) {
          console.log("Missing YouTube favorite videoId:", item);
          return;
        }

        const artist =
          item.artist || item.user?.name || item.channelTitle || "Unknown Artist";
        const thumbnail =
          typeof item.thumbnail === "string"
            ? item.thumbnail
            : typeof item.cover === "string"
              ? item.cover
              : typeof item.artwork === "string"
                ? item.artwork
                : "";

        router.push({
          pathname: "/youtube-player",
          params: {
            videoId,
            title: item.title || "YouTube Music",
            channelTitle: item.channelTitle || artist,
            thumbnail,
          },
        } as any);

        return;
      }

      void playSong(item as any, favoriteSongs as any, index, {
        source: "playlist",
        label: "Favorites",
        artistName: item.artist || item.user?.name,
      });
    },
    [favoriteSongs, playSong]
  );

  const renderShortcut = (shortcut: LibraryShortcut) => (
    <TouchableOpacity
      key={shortcut.href}
      activeOpacity={0.88}
      style={styles.shortcutCard}
      onPress={() => router.push(shortcut.href as any)}
    >
      <View style={styles.shortcutIcon}>
        <Ionicons name={shortcut.icon} size={20} color={COLORS.primaryGlow} />
      </View>
      <View style={styles.shortcutCopy}>
        <Text style={styles.shortcutLabel}>{shortcut.label}</Text>
        <Text style={styles.shortcutDescription} numberOfLines={1}>
          {shortcut.description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );

  const renderFavorite = ({ item, index }: { item: FavoriteItem; index: number }) => {
    const isYoutube = isYouTubeFavorite(item);
    const active = !isYoutube && String(currentSong?.id || "") === String(item.id || "");
    const artist = item.artist || item.user?.name || item.channelTitle || "Unknown Artist";

    return (
      <TouchableOpacity
        style={[styles.songRow, active && styles.activeRow]}
        activeOpacity={0.85}
        onPress={() => playFavorite(item, index)}
      >
        <LinearGradient colors={GRADIENTS.neon} style={styles.coverBorder}>
          <HTImage source={item} style={styles.cover} contentFit="cover" />
        </LinearGradient>

        <View style={styles.songInfo}>
          <View style={styles.badgeRow}>
            {isYoutube ? (
              <>
                <Ionicons name="tv" size={13} color="#ff0033" />
                <Text style={styles.badgeText}>Hidden Tunes TV</Text>
              </>
            ) : (
              <>
                <Ionicons name="musical-notes" size={13} color={COLORS.primary} />
                <Text style={styles.badgeText}>{item.sourceName || "Hidden Tunes"}</Text>
              </>
            )}
          </View>

          <Text numberOfLines={1} style={[styles.songTitle, active && styles.activeText]}>
            {item.title || "Untitled"}
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
            onPress={() => void toggleFavorite(item as any)}
            hitSlop={8}
          >
            <Ionicons name="heart" size={24} color={COLORS.pink} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <View pointerEvents="none" style={styles.glowPurple} />
        <View pointerEvents="none" style={styles.glowCyan} />

        <View style={styles.header}>
          <Text style={styles.kicker}>LIBRARY</Text>
          <Text style={styles.title}>Favorites</Text>
          <Text style={styles.subtitle}>
            {favoriteSongs.length === 0
              ? "Saved sounds will appear here"
              : `${favoriteSongs.length} saved sound${favoriteSongs.length === 1 ? "" : "s"}`}
          </Text>
        </View>

        <View style={styles.shortcutsPanel}>{LIBRARY_SHORTCUTS.map(renderShortcut)}</View>

        {favoriteSongs.length === 0 ? (
          <View style={styles.emptyBox}>
            <PremiumEmptyState
              icon="heart-outline"
              title="Your saved sound is waiting"
              message="Tap the heart on any track or TV pick and it will land here in a clean, private collection."
              actionLabel="Browse Music"
              onAction={() => router.push("/music-feed" as any)}
            />
          </View>
        ) : (
          <FlatList
            data={favoriteSongs}
            keyExtractor={(item, index) =>
              item.id ? `favorite-${item.id}-${index}` : `favorite-${index}`
            }
            renderItem={renderFavorite}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        )}
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 58,
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
  header: {
    marginBottom: 18,
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  title: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: "900",
    marginTop: 6,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 6,
    fontWeight: "700",
  },
  shortcutsPanel: {
    gap: 10,
    marginBottom: 20,
  },
  shortcutCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  shortcutIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.12)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.22)",
  },
  shortcutCopy: {
    flex: 1,
    minWidth: 0,
  },
  shortcutLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  shortcutDescription: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 3,
    fontWeight: "700",
  },
  emptyBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 120,
    paddingHorizontal: 12,
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
  emptyButton: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 999,
  },
  emptyButtonText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "900",
  },
  listContent: {
    paddingBottom: 180,
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
    minWidth: 0,
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
