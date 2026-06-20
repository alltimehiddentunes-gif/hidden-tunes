import { useCallback, useMemo } from "react";
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

import { VideoCategoryCard } from "../../components/video/VideoDiscoveryCards";
import { COLORS } from "../../constants/theme";
import { prefetchVideosForCategory } from "../../services/videoDiscoveryApi";
import { LAUNCH_VIDEO_CATEGORIES } from "../../utils/launchVideoCategories";

export default function VideoDiscoveryHomeScreen() {
  const openCategory = useCallback((categoryId: string) => {
    prefetchVideosForCategory(categoryId);
    router.push({
      pathname: "/videos/[categoryId]",
      params: { categoryId },
    } as any);
  }, []);

  const categories = useMemo(() => LAUNCH_VIDEO_CATEGORIES, []);

  return (
    <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.85}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.kicker}>HIDDEN TUNES VIDEOS</Text>
          <Text style={styles.title}>Browse Videos</Text>
          <Text style={styles.subtitle}>
            Curated visual rooms from Hidden Tunes
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {categories.map((category) => (
            <VideoCategoryCard
              key={category.id}
              category={category}
              onPress={() => openCategory(category.id)}
            />
          ))}
        </View>

        <TouchableOpacity
          activeOpacity={0.86}
          style={styles.searchLink}
          onPress={() => router.push("/tv" as any)}
        >
          <Ionicons name="search-outline" size={18} color={COLORS.primary} />
          <Text style={styles.searchLinkText}>Search all Hidden Tunes videos</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginTop: 4,
  },
  headerText: { flex: 1 },
  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
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
    marginTop: 6,
    lineHeight: 18,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 8,
  },
  searchLink: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchLinkText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
});
