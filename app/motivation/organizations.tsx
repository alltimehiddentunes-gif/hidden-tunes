import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HTImage from "@/components/HTImage";
import AppShell from "@/components/navigation/AppShell";
import { COLORS, GRADIENTS } from "@/constants/theme";
import { formatMotivationCountLabel } from "@/utils/motivationEntity";
import { listStashedMotivationEntities } from "@/utils/motivationGrouping";

function goBack() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/motivation" as never);
}

export default function MotivationOrganizationsScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const organizations = useMemo(() => {
    const all = listStashedMotivationEntities("organization").sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
    );
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((org) => org.displayName.toLowerCase().includes(q));
  }, [query]);

  const renderItem = useCallback(
    ({ item }: { item: (typeof organizations)[number] }) => (
      <TouchableOpacity
        style={styles.row}
        onPress={() =>
          router.push(`/motivation/organization/${encodeURIComponent(item.id)}` as never)
        }
      >
        <HTImage uri={item.artwork || undefined} style={styles.art} contentFit="cover" />
        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={2}>
            {item.displayName}
          </Text>
          <Text style={styles.meta}>
            {formatMotivationCountLabel(item.episodeCount, "episodes")}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
    ),
    []
  );

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <FlatList
          data={organizations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 120 + Math.max(insets.bottom, 8) }}
          ListHeaderComponent={
            <View style={styles.header}>
              <TouchableOpacity style={styles.backButton} onPress={goBack}>
                <Ionicons name="chevron-back" size={24} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.title}>Organizations & Publishers</Text>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color={COLORS.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search organizations"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.searchInput}
                  autoCorrect={false}
                />
              </View>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              Open Motivationals home first to load organization previews, then return here.
            </Text>
          }
        />
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  title: { color: COLORS.text, fontSize: 26, fontWeight: "900", marginBottom: 14 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 15, padding: 0 },
  row: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  art: { width: 52, height: 52, borderRadius: 14 },
  copy: { flex: 1 },
  name: { color: COLORS.text, fontWeight: "800", fontSize: 15 },
  meta: { color: COLORS.textMuted, marginTop: 4, fontSize: 12 },
  empty: { color: COLORS.textMuted, textAlign: "center", marginTop: 40, paddingHorizontal: 24 },
});
