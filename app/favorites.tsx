import { useCallback, useEffect, useMemo } from "react";
import {
  ScrollView,
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
import FavoriteButton from "../components/FavoriteButton";
import MatureContentBadge from "../components/mature/MatureContentBadge";
import { COLORS, GRADIENTS } from "../constants/theme";
import PremiumEmptyState from "../components/PremiumEmptyState";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "../context/PlayerContext";
import { useFavorites } from "../hooks/useFavorites";
import { usePlaybackRouter } from "../hooks/usePlaybackRouter";
import { normalizePodcastEpisode } from "../services/podcasts/podcastNormalizer";
import type { FavoriteItemType, UnifiedFavoriteItem } from "../types/favorites";
import { songFavoriteToAppSong } from "../services/favorites/unifiedFavorites";
import { logVisibleFeatureChecklist } from "../utils/visibleFeatureDiagnostics";

type FavoriteSection = {
  id: string;
  title: string;
  type: FavoriteItemType;
  items: UnifiedFavoriteItem[];
};

const SECTION_ORDER: Array<{ type: FavoriteItemType; title: string }> = [
  { type: "song", title: "Favorite Songs" },
  { type: "artist", title: "Favorite Artists" },
  { type: "album", title: "Favorite Albums" },
  { type: "radio_station", title: "Favorite Radio Stations" },
  { type: "podcast_show", title: "Favorite Podcasts" },
  { type: "podcast_episode", title: "Favorite Podcast Episodes" },
];

function sanitizeYouTubeVideoId(value: unknown) {
  const text = String(value || "").replace("youtube-", "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;
  const match = text.match(/[a-zA-Z0-9_-]{11}/);
  return match ? match[0] : "";
}

function isYouTubeFavorite(item: UnifiedFavoriteItem) {
  return (
    item.source === "youtube" ||
    item.metadata?.legacyType === "youtube_video" ||
    Boolean(item.metadata?.videoId)
  );
}

export default function FavoritesScreen() {
  const { playSong } = usePlayerActions();
  const { favorites: songFavorites } = usePlayerState();
  const { visibleFavorites } = useFavorites();
  const { playRadioStation, playPodcastEpisode } = usePlaybackRouter();
  const { currentSong, isPlaying } = usePlayerNowPlaying();

  const sections = useMemo(() => {
    return SECTION_ORDER.map(({ type, title }) => ({
      id: type,
      type,
      title,
      items: visibleFavorites.filter((item) => item.type === type),
    })).filter((section) => section.items.length > 0) as FavoriteSection[];
  }, [visibleFavorites]);

  const totalVisible = visibleFavorites.length;

  useEffect(() => {
    logVisibleFeatureChecklist({
      favoritesScreenMounted: true,
      favoriteSectionCount: sections.length,
      favoriteItemCount: totalVisible,
    });
  }, [sections.length, totalVisible]);

  const playFavoriteSong = useCallback(
    (item: UnifiedFavoriteItem, index: number) => {
      if (isYouTubeFavorite(item)) {
        const videoId = sanitizeYouTubeVideoId(item.metadata?.videoId || item.id);
        if (!videoId) return;

        router.push({
          pathname: "/youtube-player",
          params: {
            videoId,
            title: item.title,
            channelTitle: item.subtitle || item.metadata?.artistName || "Unknown Artist",
            thumbnail: item.artwork || "",
          },
        } as any);
        return;
      }

      const song = songFavoriteToAppSong(item);
      const queue = songFavorites;
      void playSong(song as any, queue as any, index, {
        source: "playlist",
        label: "Favorites",
        artistName: song.artist,
      });
    },
    [playSong, songFavorites]
  );

  const openFavorite = useCallback(
    (item: UnifiedFavoriteItem) => {
      switch (item.type) {
        case "song":
          playFavoriteSong(item, 0);
          return;
        case "artist":
          router.push({
            pathname: "/artist/[id]",
            params: { id: item.id },
          } as any);
          return;
        case "album":
          router.push({
            pathname: "/album/[id]",
            params: { id: item.id },
          } as any);
          return;
        case "radio_station":
          void playRadioStation({
            id: item.id,
            title: item.title,
            streamUrl: String(item.metadata?.streamUrl || ""),
            artworkUrl: item.artwork,
            country: item.metadata?.stationCountry,
            genre: item.metadata?.stationGenre,
            tags: item.metadata?.stationGenre ? [String(item.metadata.stationGenre)] : [],
            source: "radio",
          });
          return;
        case "podcast_show":
          router.push({
            pathname: "/podcasts/show/[showId]",
            params: {
              showId: item.id,
              title: item.title,
              isMature: item.metadata?.is_mature ? "1" : "0",
            },
          } as any);
          return;
        case "podcast_episode": {
          const normalized = normalizePodcastEpisode(
            {
              id: item.id,
              show_id: String(item.metadata?.showId || ""),
              title: item.title,
              artwork_url: item.artwork,
              audio_url: String(item.metadata?.streamUrl || ""),
              duration_seconds:
                typeof item.metadata?.duration === "number"
                  ? item.metadata.duration
                  : undefined,
              published_at: item.metadata?.episodeDate,
              is_mature: item.metadata?.is_mature,
              content_rating: item.metadata?.content_rating,
              sourceName: "Hidden Tunes",
            },
            String(item.metadata?.showTitle || item.subtitle || item.title)
          );
          if (!normalized) return;
          void playPodcastEpisode(normalized, [normalized]);
          return;
        }
        default:
          return;
      }
    },
    [playFavoriteSong, playPodcastEpisode, playRadioStation]
  );

  const typeIcon = (type: FavoriteItemType) => {
    if (type === "artist") return "person";
    if (type === "album") return "albums";
    if (type === "radio_station") return "radio";
    if (type === "podcast_show" || type === "podcast_episode") return "mic";
    return "musical-notes";
  };

  const renderFavoriteRow = (item: UnifiedFavoriteItem, index: number) => {
    const isSong = item.type === "song";
    const active = isSong && String(currentSong?.id || "") === String(item.id || "");

    return (
      <TouchableOpacity
        key={`${item.type}-${item.id}-${index}`}
        style={[styles.row, active && styles.rowActive]}
        activeOpacity={0.85}
        onPress={() => openFavorite(item)}
      >
        <LinearGradient colors={GRADIENTS.neon} style={styles.coverBorder}>
          <HTImage
            source={{ artwork: item.artwork, cover: item.artwork, thumbnail: item.artwork }}
            style={styles.cover}
            contentFit="cover"
          />
        </LinearGradient>

        <View style={styles.copy}>
          <View style={styles.badgeRow}>
            <Ionicons name={typeIcon(item.type) as any} size={13} color={COLORS.primary} />
            <Text style={styles.badgeText}>{item.source || "Hidden Tunes"}</Text>
            <MatureContentBadge item={item.metadata} />
          </View>
          <Text numberOfLines={1} style={[styles.title, active && styles.titleActive]}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text numberOfLines={1} style={styles.subtitle}>
              {item.subtitle}
            </Text>
          ) : null}
        </View>

        {active ? (
          <NeonEQ isPlaying={isPlaying} size="small" />
        ) : (
          <FavoriteButton item={item} size={22} />
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
          <Text style={styles.heading}>Favorites</Text>
          <Text style={styles.headerSubtitle}>
            {totalVisible === 0
              ? "Your favorites will appear here."
              : `${totalVisible} saved item${totalVisible === 1 ? "" : "s"}`}
          </Text>
        </View>

        {totalVisible === 0 ? (
          <View style={styles.emptyBox}>
            <PremiumEmptyState
              icon="heart-outline"
              title="Your favorites will appear here."
              message="Save songs, artists, albums, radio stations, and podcasts with the heart icon."
              actionLabel="Browse Music"
              onAction={() => router.push("/music-feed" as any)}
            />
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
            {sections.map((section) => (
              <View key={section.id} style={styles.sectionBlock}>
                <Text style={styles.sectionEyebrow}>{section.title.toUpperCase()}</Text>
                {section.items.map((item, index) => renderFavoriteRow(item, index))}
              </View>
            ))}
          </ScrollView>
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
  heading: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: "900",
    marginTop: 6,
  },
  headerSubtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 6,
    fontWeight: "700",
  },
  emptyBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 120,
    paddingHorizontal: 12,
  },
  listContent: {
    paddingBottom: 180,
    gap: 18,
  },
  sectionBlock: {
    gap: 10,
  },
  sectionEyebrow: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  row: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 24,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  rowActive: {
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
  copy: {
    flex: 1,
    marginLeft: 14,
    minWidth: 0,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 5,
  },
  badgeText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  titleActive: {
    color: COLORS.primary,
  },
  subtitle: {
    color: COLORS.textMuted,
    marginTop: 5,
    fontSize: 13,
    fontWeight: "700",
  },
});
