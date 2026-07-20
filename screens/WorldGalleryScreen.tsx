import { memo, useCallback, useMemo } from "react";
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
import { safeRouterBack } from "../utils/safeNavigation";

import WorldCard from "../components/worlds/WorldCard";
import { COLORS, GRADIENTS } from "../constants/theme";
import { getWorldGalleryItems } from "../utils/worldPresentation";

type WorldGalleryScreenProps = {
  /** When true, renders inside parent ScrollView (no back header, no nested vertical list). */
  embedded?: boolean;
};

function WorldGalleryScreen({ embedded = false }: WorldGalleryScreenProps) {
  const worlds = useMemo(() => getWorldGalleryItems(), []);

  const openWorld = useCallback((worldId: string) => {
    router.push({ pathname: "/worlds/[worldId]", params: { worldId } } as any);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: (typeof worlds)[number] }) => (
      <WorldCard
        worldId={item.id}
        variant="gallery"
        onPress={() => openWorld(item.id)}
      />
    ),
    [openWorld]
  );

  const keyExtractor = useCallback((item: (typeof worlds)[number]) => item.id, []);

  if (embedded) {
    return (
      <View style={styles.embeddedSection}>
        <View style={styles.embeddedHeader}>
          <View style={styles.embeddedHeaderCopy}>
            <Text style={styles.embeddedEyebrow}>GALLERY</Text>
            <Text style={styles.embeddedTitle}>Emotional Worlds</Text>
            <Text style={styles.embeddedLead}>
              Five cinematic rooms built from mood, memory, and atmosphere.
            </Text>
          </View>
          <View style={styles.embeddedIcon}>
            <Ionicons name="planet" size={22} color={COLORS.primaryGlow} />
          </View>
        </View>

        <View style={styles.embeddedList}>
          {worlds.map((item) => (
            <WorldCard
              key={item.id}
              worldId={item.id}
              variant="gallery"
              onPress={() => openWorld(item.id)}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.standaloneBody}>
        <View style={styles.topBar}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => safeRouterBack("/worlds")}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.topCopy}>
            <Text style={styles.kicker}>HIDDEN TUNES</Text>
            <Text style={styles.title}>Emotional Worlds</Text>
          </View>
        </View>

        <Text style={styles.lead}>
          Five cinematic rooms built from mood, memory, and atmosphere.
        </Text>

        <FlatList
          data={worlds}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </LinearGradient>
  );
}

export default memo(WorldGalleryScreen);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  standaloneBody: {
    flex: 1,
    paddingTop: 52,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  topCopy: {
    flex: 1,
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
    letterSpacing: -0.6,
  },
  lead: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 140,
  },
  embeddedSection: {
    marginTop: 28,
    borderRadius: 30,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  embeddedHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  embeddedHeaderCopy: {
    flex: 1,
  },
  embeddedEyebrow: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  embeddedTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 6,
  },
  embeddedLead: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    marginTop: 8,
  },
  embeddedIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.14)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.32)",
  },
  embeddedList: {
    gap: 14,
  },
});
