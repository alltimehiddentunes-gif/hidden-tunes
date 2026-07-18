/**
 * Shared, screen-local Sports helpers for app/sports/*.
 *
 * Underscore-prefixed so expo-router never treats this as a route.
 *
 * Presentational building blocks (cards, shelves, hero, skeletons, empty /
 * error states, follow / reminder buttons, status badges, player shell,
 * header) live in "../../components/sports" — this file only holds the bits
 * that library intentionally doesn't own: the full-UI feature gate, the
 * shared 30s clock, a lightweight back+title header for sub-screens, and a
 * couple of tiny row primitives used by screens that predate a dedicated
 * component (following / saved lists).
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { isSportsFullUiEnabled } from "../../constants/sportsFlags";
import { SPORTS_COLORS } from "../../lib/sports/ui/sportsTheme";

const CLOCK_INTERVAL_MS = 30_000;

/** Safe Sports back — prefer history, else replace Sports home. */
export function navigateSportsBack(): void {
  if (typeof (router as { canGoBack?: () => boolean }).canGoBack === "function") {
    if ((router as { canGoBack: () => boolean }).canGoBack()) {
      router.back();
      return;
    }
  }
  router.replace("/sports" as never);
}

/** One shared ticking clock per screen — never create a timer per card. */
export function useSportsNowClock(intervalMs: number = CLOCK_INTERVAL_MS): number {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}

export function useSportsFullUiGate(): { allowed: boolean; reason: string } {
  return useMemo(() => {
    if (!isSportsFullUiEnabled()) {
      return {
        allowed: false,
        reason: "Sports isn't available on this build yet. Check back soon.",
      };
    }
    return { allowed: true, reason: "" };
  }, []);
}

export function SportsDisabledState({ message }: { message: string }) {
  return (
    <View style={styles.disabledWrap}>
      <View style={styles.disabledIcon}>
        <Ionicons name="football-outline" size={30} color={SPORTS_COLORS.textDim} />
      </View>
      <Text style={styles.disabledTitle}>Sports is not ready yet</Text>
      <Text style={styles.disabledMessage}>{message}</Text>
      <Pressable style={styles.disabledBack} onPress={() => router.back()} hitSlop={12}>
        <Text style={styles.disabledBackText}>Go back</Text>
      </Pressable>
    </View>
  );
}

/** Lightweight back+title header for sub-screens (Sports home uses the real SportsHeader). */
export function SportsScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string | null;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.screenHeader} testID="sports-screen-header">
      <Pressable
        style={styles.headerBackBtn}
        onPress={onBack || navigateSportsBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        testID="sports-back-button"
      >
        <Ionicons name="chevron-back" size={22} color={SPORTS_COLORS.text} />
      </Pressable>
      <View style={styles.headerTextWrap}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : <View style={styles.headerRightSpacer} />}
    </View>
  );
}

export function CenterSpinner({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={SPORTS_COLORS.amber} />
      {label ? <Text style={styles.centerLabel}>{label}</Text> : null}
    </View>
  );
}

/** Value/label row that simply omits itself when the value is empty — never renders "N/A". */
export function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value || !value.trim()) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/** Simple removable list row used by Following / Saved (no dedicated card exists for these). */
export function RemovableRow({
  title,
  subtitle,
  onPress,
  onRemove,
  removeDisabled,
}: {
  title: string;
  subtitle?: string | null;
  onPress?: () => void;
  onRemove: () => void;
  removeDisabled?: boolean;
}) {
  return (
    <View style={styles.removableRow}>
      <Pressable style={styles.removableRowMain} onPress={onPress} disabled={!onPress}>
        <Text style={styles.removableRowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.removableRowSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </Pressable>
      <Pressable
        style={styles.removeBtn}
        onPress={onRemove}
        disabled={removeDisabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${title}`}
      >
        <Ionicons name="close" size={15} color={SPORTS_COLORS.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  disabledWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
  },
  disabledIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  disabledTitle: { color: SPORTS_COLORS.text, fontSize: 18, fontWeight: "700" },
  disabledMessage: {
    color: SPORTS_COLORS.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  disabledBack: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: SPORTS_COLORS.surfaceGlass,
  },
  disabledBackText: { color: SPORTS_COLORS.text, fontSize: 13, fontWeight: "600" },

  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPORTS_COLORS.surfaceGlass,
  },
  headerTextWrap: { flex: 1, minWidth: 0 },
  headerTitle: { color: SPORTS_COLORS.text, fontSize: 17, fontWeight: "700" },
  headerSubtitle: { color: SPORTS_COLORS.textDim, fontSize: 12, marginTop: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 36 },
  headerRightSpacer: { width: 36 },

  center: { padding: 32, alignItems: "center", gap: 10 },
  centerLabel: { color: SPORTS_COLORS.textDim, fontSize: 13 },

  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SPORTS_COLORS.border,
    gap: 12,
  },
  detailLabel: { color: SPORTS_COLORS.textDim, fontSize: 12.5 },
  detailValue: { color: SPORTS_COLORS.text, fontSize: 12.5, fontWeight: "600", flex: 1, textAlign: "right" },

  removableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SPORTS_COLORS.border,
  },
  removableRowMain: { flex: 1 },
  removableRowTitle: { color: SPORTS_COLORS.text, fontSize: 14, fontWeight: "700" },
  removableRowSubtitle: { color: SPORTS_COLORS.textDim, fontSize: 11.5, marginTop: 2 },
  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPORTS_COLORS.surfaceGlass,
  },
});

export { SPORTS_COLORS };
