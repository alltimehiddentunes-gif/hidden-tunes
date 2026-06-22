import { useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import {
  RadioCategoryCard,
  RadioEmotionalWorldCard,
  RadioStationRailCard,
} from "../../components/radio/RadioBrowserCards";
import MatureContentConsentModal from "../../components/mature/MatureContentConsentModal";
import { getRadioEmotionalWorld } from "../../constants/radioEmotionalWorlds";
import { RADIO_HOME_LANE_PAGE_SIZE } from "../../constants/radioFoundation";
import { COLORS } from "../../constants/theme";
import { useMatureContentGate } from "../../hooks/useMatureContentGate";
import { usePlaybackRouter } from "../../hooks/usePlaybackRouter";
import { useRadioHomeDiscovery } from "../../hooks/useRadioHomeDiscovery";
import { loadRadioCategoryPage } from "../../services/radio/radioBrowserApi";
import { normalizeRadioStation } from "../../services/radio/radioNormalizer";
import type { RadioStationListItem } from "../../types/radio";

type StationSectionProps = {
  title: string;
  eyebrow: string;
  stations: RadioStationListItem[];
  onPressStation: (item: RadioStationListItem) => void;
  seeAllCategoryId?: string;
};

function StationRailSection({
  title,
  eyebrow,
  stations,
  onPressStation,
  seeAllCategoryId,
}: StationSectionProps) {
  if (!stations.length) return null;

  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionMeta}>
            {Math.min(stations.length, RADIO_HOME_LANE_PAGE_SIZE)} stations
          </Text>
        </View>
        {seeAllCategoryId ? (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.seeAllButton}
            onPress={() =>
              router.push({
                pathname: "/stations/[categoryId]",
                params: { categoryId: seeAllCategoryId },
              } as any)
            }
          >
            <Text style={styles.seeAllText}>See all</Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
          </TouchableOpacity>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={stations}
        keyExtractor={(item) => `${eyebrow}-${item.id}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item }) => (
          <RadioStationRailCard item={item} onPress={() => onPressStation(item)} />
        )}
      />
    </View>
  );
}

export default function RadioStationsHomeScreen() {
  const { playRadioStation } = usePlaybackRouter();
  const { consentVisible, runWithMatureConsent, cancelConsent, confirmConsent } =
    useMatureContentGate();
  const {
    featured,
    trending,
    popular,
    recommended,
    recentlyPlayed,
    emotionalWorlds,
    browseCategories,
    loading,
    resolveStation,
  } = useRadioHomeDiscovery();

  const openCategory = useCallback((categoryId: string) => {
    router.push({
      pathname: "/stations/[categoryId]",
      params: { categoryId },
    } as any);
  }, []);

  const openSearch = useCallback(() => {
    router.push("/stations/search" as any);
  }, []);

  const playStation = useCallback(
    async (item: RadioStationListItem) => {
      let station = resolveStation(item.id);

      if (!station) {
        const resolved = await loadRadioCategoryPage("featured", { offset: 0, limit: 40 }).catch(
          () => null
        );
        station = resolved?.stations.find((entry) => entry.id === item.id) || null;
      }

      if (!station) {
        Alert.alert("Unavailable", "This station is unavailable right now.");
        return;
      }

      const result = await playRadioStation(normalizeRadioStation(station));
      if (!result.ok) {
        Alert.alert("Unavailable", result.error || "This station is unavailable right now.");
      }
    },
    [playRadioStation, resolveStation]
  );

  const handleStationPress = useCallback(
    (item: RadioStationListItem) => {
      runWithMatureConsent(item, () => {
        void playStation(item);
      });
    },
    [playStation, runWithMatureConsent]
  );

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
          <Text style={styles.kicker}>HIDDEN TUNES</Text>
          <Text style={styles.title}>LIVE RADIO</Text>
          <Text style={styles.subtitle}>Premium live discovery tuned to your mood</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity activeOpacity={0.88} style={styles.searchLink} onPress={openSearch}>
          <Ionicons name="search-outline" size={18} color={COLORS.primary} />
          <Text style={styles.searchLinkText}>Search live stations</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        {loading ? (
          <View style={styles.loadingPanel}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading live stations...</Text>
          </View>
        ) : (
          <>
            <StationRailSection
              eyebrow="FEATURED"
              title="Featured Stations"
              stations={featured}
              onPressStation={handleStationPress}
              seeAllCategoryId="featured"
            />
            <StationRailSection
              eyebrow="TRENDING"
              title="Trending Now"
              stations={trending}
              onPressStation={handleStationPress}
              seeAllCategoryId="trending"
            />
            <StationRailSection
              eyebrow="POPULAR"
              title="Most Popular"
              stations={popular}
              onPressStation={handleStationPress}
              seeAllCategoryId="popular"
            />
            <StationRailSection
              eyebrow="RECENT"
              title="Recently Played"
              stations={recentlyPlayed}
              onPressStation={handleStationPress}
            />
            <StationRailSection
              eyebrow="FOR YOU"
              title="Recommended For You"
              stations={recommended}
              onPressStation={handleStationPress}
              seeAllCategoryId="recommended"
            />

            {emotionalWorlds.length > 0 ? (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionEyebrow}>EMOTIONAL WORLDS RADIO</Text>
                <Text style={styles.sectionTitle}>Radio tuned to how you feel</Text>
                <FlatList
                  horizontal
                  data={emotionalWorlds}
                  keyExtractor={(entry) => entry.world.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.railContent}
                  initialNumToRender={3}
                  maxToRenderPerBatch={3}
                  windowSize={5}
                  removeClippedSubviews
                  renderItem={({ item }) => {
                    const catalogTarget =
                      getRadioEmotionalWorld(item.world.id)?.catalogTarget || undefined;
                    return (
                      <RadioEmotionalWorldCard
                        category={item.world}
                        stationCount={catalogTarget}
                        onPress={() => openCategory(item.world.id)}
                      />
                    );
                  }}
                />
              </View>
            ) : null}

            {browseCategories.length > 0 ? (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionEyebrow}>BROWSE</Text>
                <Text style={styles.sectionTitle}>Countries · Languages · Genres · More</Text>
                <View style={styles.grid}>
                  {browseCategories.map((category) => (
                    <RadioCategoryCard
                      key={category.id}
                      category={category}
                      onPress={() => openCategory(category.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}

        <TouchableOpacity
          activeOpacity={0.86}
          style={styles.listeningRoomLink}
          onPress={() =>
            router.push({
              pathname: "/radio",
              params: { title: "Hidden Tunes Listening Room" },
            } as any)
          }
        >
          <Ionicons name="musical-notes-outline" size={18} color={COLORS.primary} />
          <Text style={styles.listeningRoomText}>Open song listening rooms</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </ScrollView>

      <MatureContentConsentModal
        visible={consentVisible}
        onCancel={cancelConsent}
        onConfirm={confirmConsent}
      />
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
  searchLink: {
    marginTop: 8,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchLinkText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  loadingPanel: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    gap: 10,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  sectionBlock: {
    marginTop: 8,
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionEyebrow: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 4,
  },
  sectionMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingTop: 18,
  },
  seeAllText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  railContent: {
    paddingRight: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  listeningRoomLink: {
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
  listeningRoomText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
});
