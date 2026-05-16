import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";

import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, GRADIENTS } from "@/constants/theme";
import { fetchChannelVideos, YouTubeVideo } from "@/services/youtube";

export default function YouTubeFeedScreen() {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    try {
      setLoading(true);
      const data = await fetchChannelVideos();
      setVideos(data || []);
    } catch (error) {
      console.log("Hidden Tunes TV load error:", error);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  const openVideo = (item: any) => {
    const videoId =
      typeof item?.id === "string"
        ? item.id
        : item?.id?.videoId ||
          item?.snippet?.resourceId?.videoId ||
          item?.snippet?.videoId;

    if (!videoId) {
      console.log("Missing YouTube videoId:", item);
      return;
    }

    router.push({
      pathname: "/youtube-player",
      params: {
        videoId,
        title: item?.title || item?.snippet?.title || "Hidden Tunes TV",
        thumbnail:
          item?.thumbnail ||
          item?.snippet?.thumbnails?.high?.url ||
          item?.snippet?.thumbnails?.medium?.url ||
          item?.snippet?.thumbnails?.default?.url ||
          "",
        channelTitle:
          item?.channelTitle || item?.snippet?.channelTitle || "Hidden Tunes TV",
      },
    });
  };

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </TouchableOpacity>

        <View>
          <Text style={styles.title}>Hidden Tunes TV</Text>
          <Text style={styles.subtitle}>Latest TV uploads</Text>
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
          <Text style={styles.emptyTitle}>No TV videos found</Text>
          <Text style={styles.emptyText}>
            Open Hidden Tunes TV and search for another video.
          </Text>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item: any, index) => {
            const id =
              typeof item?.id === "string"
                ? item.id
                : item?.id?.videoId ||
                  item?.snippet?.resourceId?.videoId ||
                  item?.snippet?.videoId ||
                  String(index);

            return String(id);
          }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.videoCard}
              activeOpacity={0.85}
              onPress={() => openVideo(item)}
            >
              <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />

              <View style={styles.info}>
                <Text numberOfLines={2} style={styles.videoTitle}>
                  {item.title}
                </Text>

                <Text numberOfLines={1} style={styles.channel}>
                  {item.channelTitle}
                </Text>

                <View style={styles.watchRow}>
                  <Ionicons name="tv" size={18} color={COLORS.primary} />
                  <Text style={styles.watchText}>Play inside TV</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </LinearGradient>
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
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
  videoCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 24,
    padding: 12,
    marginBottom: 18,
  },
  thumbnail: {
    width: "100%",
    height: 200,
    borderRadius: 20,
    backgroundColor: COLORS.card,
  },
  info: {
    paddingTop: 14,
  },
  videoTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 24,
  },
  channel: {
    color: COLORS.textMuted,
    marginTop: 6,
    fontSize: 13,
  },
  watchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  watchText: {
    color: "#ff0033",
    fontWeight: "700",
    marginLeft: 6,
  },
});
