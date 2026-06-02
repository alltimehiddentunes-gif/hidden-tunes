import { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import MoodRoomCard from "../../components/explore/MoodRoomCard";
import WorldsExploreSection from "../../components/explore/WorldsExploreSection";
import AppShell from "../../components/navigation/AppShell";
import { COLORS, GRADIENTS } from "../../constants/theme";
import WorldGalleryScreen from "../../screens/WorldGalleryScreen";
import {
  fetchHiddenTunesCatalog,
  type HiddenTunesSong,
} from "../../services/hiddenTunes";
import {
  buildMoodRoomGroups,
  type MoodRoomGroup,
} from "../../utils/moodRooms";

type ExploreMoodRoom = MoodRoomGroup<HiddenTunesSong>;

export default function WorldsIndexScreen() {
  const [moodRooms, setMoodRooms] = useState<ExploreMoodRoom[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadMoodRooms() {
      try {
        const catalog = await fetchHiddenTunesCatalog();
        if (!mounted) return;
        setMoodRooms(buildMoodRoomGroups(catalog.songs, 6));
      } catch {
        if (mounted) {
          setMoodRooms([]);
        }
      }
    }

    void loadMoodRooms();

    return () => {
      mounted = false;
    };
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

  return (
    <AppShell>
      <View style={styles.screen}>
        <LinearGradient colors={GRADIENTS.main} style={styles.explorePanel}>
          <View style={styles.heroRow}>
            <View style={styles.heroIcon}>
              <Ionicons name="sparkles" size={24} color={COLORS.primaryGlow} />
            </View>

            <View style={styles.heroCopy}>
              <Text style={styles.kicker}>SMART DISCOVERY</Text>
              <Text style={styles.title}>Explore Hidden Tunes</Text>
              <Text style={styles.subtitle}>
                Browse cinematic worlds and mood rooms generated from the current catalog.
              </Text>
            </View>
          </View>

          {moodRooms.length > 0 ? (
            <View style={styles.moodSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Mood Rooms</Text>
                <Text style={styles.sectionMeta}>Live catalog matches</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.moodRail}
              >
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
              </ScrollView>
            </View>
          ) : null}

          <WorldsExploreSection showSeeAll={false} />
        </LinearGradient>

        <View style={styles.galleryWrap}>
          <WorldGalleryScreen />
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.backgroundDeep,
  },
  explorePanel: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.14)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.32)",
  },
  heroCopy: {
    flex: 1,
  },
  kicker: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  title: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 5,
  },
  moodSection: {
    marginTop: 22,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
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
  galleryWrap: {
    flex: 1,
    minHeight: 260,
  },
});
