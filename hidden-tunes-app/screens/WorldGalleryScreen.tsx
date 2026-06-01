import { memo, useCallback, useMemo } from "react";
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import WorldCard from "../components/worlds/WorldCard";
import { COLORS, GRADIENTS } from "../constants/theme";
import { navigateToWorldDetailWithMerge } from "../navigation/worldNavigation";
import { getWorldGalleryItems } from "../utils/worldPresentation";

function WorldGalleryScreen() {
  const worlds = useMemo(() => getWorldGalleryItems(), []);

  const renderItem = useCallback(
    ({ item }: { item: (typeof worlds)[number] }) => (
      <WorldCard
        worldId={item.id}
        variant="gallery"
        onPress={() => navigateToWorldDetailWithMerge(item.id)}
      />
    ),
    []
  );

  const keyExtractor = useCallback((item: (typeof worlds)[number]) => item.id, []);

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.back()}
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
      </SafeAreaView>
    </LinearGradient>
  );
}

export default memo(WorldGalleryScreen);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 8,
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
    paddingBottom: 40,
  },
});
