import { memo, useCallback, useMemo } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { COLORS } from "../../constants/theme";
import { getWorldGalleryItems } from "../../utils/worldPresentation";
import WorldCard from "../worlds/WorldCard";

type WorldsExploreSectionProps = {
  showSeeAll?: boolean;
};

const WorldsExploreSection = memo(function WorldsExploreSection({
  showSeeAll = true,
}: WorldsExploreSectionProps) {
  const worlds = useMemo(() => getWorldGalleryItems(), []);

  const renderItem = useCallback(
    ({ item }: { item: (typeof worlds)[number] }) => (
      <WorldCard
        worldId={item.id}
        variant="compact"
        onPress={() =>
          router.push({ pathname: "/worlds/[worldId]", params: { worldId: item.id } } as any)
        }
      />
    ),
    []
  );

  const keyExtractor = useCallback((item: (typeof worlds)[number]) => item.id, []);

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>CINEMATIC WORLDS</Text>
          <Text style={styles.title}>Worlds</Text>
          <Text style={styles.subtitle}>
            Step into emotional rooms curated by mood and atmosphere.
          </Text>
        </View>

        {showSeeAll ? (
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => router.push("/worlds" as any)}
            style={styles.seeAllButton}
          >
            <Text style={styles.seeAllText}>See all</Text>
            <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        horizontal
        data={worlds}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      />
    </View>
  );
});

export default WorldsExploreSection;

const styles = StyleSheet.create({
  section: {
    marginTop: 28,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  headerCopy: {
    flex: 1,
    paddingRight: 8,
  },
  kicker: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 6,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    fontWeight: "600",
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: 18,
  },
  seeAllText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  rail: {
    paddingRight: 8,
    paddingBottom: 4,
  },
});
