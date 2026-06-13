import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS } from "../../constants/theme";
import { type AppNavigationItem } from "./navigationConfig";

function fallbackTitle(pathname: string) {
  const segment = pathname.split("/").filter(Boolean).pop();
  if (!segment) return "Hidden Tunes";
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function DesktopTopbar({
  activeItem,
  pathname,
}: {
  activeItem?: AppNavigationItem;
  pathname: string;
}) {
  const router = useRouter();
  const title = useMemo(() => activeItem?.label || fallbackTitle(pathname), [activeItem?.label, pathname]);

  return (
    <View style={styles.topbarWrap}>
      <BlurView intensity={22} tint="dark" style={styles.topbarGlass}>
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>Hidden Tunes Desktop</Text>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open search"
            onPress={() => router.push("/search" as any)}
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
          >
            <Ionicons name="search" size={18} color={COLORS.cyan} />
            <Text style={styles.actionText}>Search</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => router.push("/profile" as any)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.actionPressed]}
          >
            <Ionicons name="person-circle-outline" size={24} color={COLORS.textMuted} />
          </Pressable>
        </View>
      </BlurView>
    </View>
  );
}

export default memo(DesktopTopbar);

const styles = StyleSheet.create({
  topbarWrap: {
    paddingTop: 16,
    paddingRight: 16,
    paddingLeft: 6,
    paddingBottom: 10,
  },
  topbarGlass: {
    minHeight: 66,
    overflow: "hidden",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(5,5,10,0.54)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    gap: 16,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  title: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionButton: {
    height: 38,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  actionText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  actionPressed: {
    opacity: 0.76,
  },
});
