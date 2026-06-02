import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";

import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import AppShell from "../components/navigation/AppShell";
import TvVideoCard from "../components/tv/TvVideoCard";
import { COLORS, GRADIENTS } from "@/constants/theme";
import { fetchChannelVideos, YouTubeVideo } from "@/services/youtube";
import type { HiddenTunesTvVideo } from "@/services/tvCatalogApi";

function getVideoId(item: Partial<YouTubeVideo> & Partial<HiddenTunesTvVideo>) {
  if (typeof item.id === "string") return item.id;

  const id = item.id as any;

  return (
    item.source_id ||
    id?.videoId ||
    id?.resourceId?.videoId ||
    (item as any)?.snippet?.resourceId?.videoId ||
    (item as any)?.snippet?.videoId ||
    ""
  );
}

function toTvVideo(item: YouTubeVideo): HiddenTunesTvVideo {
  const videoId = getVideoId(item) || String(item.id || item.title);
  const thumbnail =
    item.thumbnail ||
    item.cover ||
    (item as any)?.snippet?.thumbnails?.high?.url ||
    (item as any)?.snippet?.thumbnails?.medium?.url ||
    (item as any)?.snippet?.thumbnails?.default?.url ||
    null;

  return {
    id: videoId,
    title: item.title || (item as any)?.snippet?.title || "Hidden Tunes TV",
    source_type: "youtube",
    source_id: videoId,
    source_url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
    embed_url: null,
    thumbnail_url: thumbnail,
    channel_name:
      item.channelTitle || (item as any)?.snippet?.channelTitle || "Hidden Tunes TV",
    category: null,
    genre: null,
    mood: null,
    format: null,
    tags: [],
  };
}

export default function YouTubeFeedScreen() {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(280, width - 36);

  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    try {
      setLoading(true);
      const data = await fetchChannelVideos();
      setVideos(data || []);
    } catch {
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  const openVideo = (item: HiddenTunesTvVideo) => {
    const videoId = getVideoId(item);

    if (!videoId) return;

    router.push({
      pathname: "/youtube-player",
      params: {
        videoId,
        title: item.title || "Hidden Tunes TV",
        thumbnail: item.thumbnail_url || "",
        channelTitle: item.channel_name || "Hidden Tunes TV",
      },
    });
  };

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="tv" size={24} color={COLORS.primary} />
          </View>

          <View>
            <Text style={styles.title}>Hidden Tunes TV</Text>
            <Text style={styles.subtitle}>Latest picks from the channel</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading videos...</Text>
          </View>
        ) : videos.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="tv" size={60} color={COLORS.primary} />
            <Text style={styles.emptyTitle}>No videos right now</Text>
            <Text style={styles.emptyText}>
              Open Hidden Tunes TV to search and watch inside the app.
            </Text>
          </View>
        ) : (
          <FlatList
            data={videos}
            keyExtractor={(item, index) => getVideoId(item) || String(index)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const video = toTvVideo(item);

              return (
                <View style={styles.cardWrap}>
                  <TvVideoCard
                    video={video}
                    width={cardWidth}
                    onPress={openVideo}
                  />
                </View>
              );
            }}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 24,
  },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "900",
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 18,
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    paddingHorizontal: 20,
  },
  list: {
    paddingBottom: 120,
  },
  cardWrap: {
    marginBottom: 22,
  },
});
