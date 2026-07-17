import { useMemo } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HTImage from "@/components/HTImage";
import AppShell from "@/components/navigation/AppShell";
import { COLORS, GRADIENTS } from "@/constants/theme";
import { formatMotivationCountLabel } from "@/utils/motivationEntity";
import {
  groupMotivationItemsIntoPrograms,
  stashMotivationGroupedProgram,
  takeMotivationEntity,
} from "@/utils/motivationGrouping";

function goBack() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/motivation" as never);
}

export default function MotivationSpeakerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const cleanId = decodeURIComponent(String(id || ""));
  const entity = takeMotivationEntity(cleanId);
  const programs = useMemo(() => {
    if (!entity?.items?.length) return [];
    return groupMotivationItemsIntoPrograms(entity.items, {
      excludeMisplacedAudiobooks: false,
    });
  }, [entity]);

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <FlatList
          data={programs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 120 + Math.max(insets.bottom, 8), paddingHorizontal: 16 }}
          ListHeaderComponent={
            <View style={styles.header}>
              <TouchableOpacity style={styles.backButton} onPress={goBack}>
                <Ionicons name="chevron-back" size={24} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.title}>{entity?.displayName || "Speaker"}</Text>
              <Text style={styles.meta}>
                {formatMotivationCountLabel(entity?.episodeCount, "episodes")}
              </Text>
              <Text style={styles.sectionTitle}>Programs</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                stashMotivationGroupedProgram(item);
                router.push(`/motivation/program/${encodeURIComponent(item.id)}` as never);
              }}
            >
              <HTImage
                uri={item.program.artwork_url || undefined}
                style={styles.art}
                contentFit="cover"
              />
              <View style={styles.copy}>
                <Text style={styles.name} numberOfLines={2}>
                  {item.program.title}
                </Text>
                <Text style={styles.metaLine}>
                  {formatMotivationCountLabel(item.episodeCount, "episodes")}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No programs found for this speaker.</Text>}
        />
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingTop: 56, paddingBottom: 12 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "900" },
  meta: { color: COLORS.textMuted, marginTop: 8, marginBottom: 18 },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "900", marginBottom: 10 },
  row: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  art: { width: 64, height: 64, borderRadius: 12 },
  copy: { flex: 1 },
  name: { color: COLORS.text, fontWeight: "800", fontSize: 15 },
  metaLine: { color: COLORS.textMuted, marginTop: 4, fontSize: 12 },
  empty: { color: COLORS.textMuted, textAlign: "center", marginTop: 24 },
});
