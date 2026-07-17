import { memo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";
import { formatStatusLabel, statusTone, type SportsStatusTone } from "@/lib/sports/ui/formatStatus";

type SportsStatusBadgeProps = {
  code: string | null | undefined;
  label?: string | null;
  minute?: string | null;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
};

const TONE_STYLES: Record<
  SportsStatusTone,
  { bg: string; fg: string; dot?: string }
> = {
  live: { bg: SPORTS_COLORS.liveSoft, fg: SPORTS_COLORS.live, dot: SPORTS_COLORS.live },
  soon: { bg: SPORTS_COLORS.amberSoft, fg: SPORTS_COLORS.amber },
  neutral: { bg: SPORTS_COLORS.surfaceGlass, fg: SPORTS_COLORS.textMuted },
  finished: { bg: SPORTS_COLORS.surfaceGlass, fg: SPORTS_COLORS.textDim },
  warn: { bg: "rgba(245,197,66,0.16)", fg: SPORTS_COLORS.warn },
  danger: { bg: "rgba(255,107,107,0.16)", fg: SPORTS_COLORS.danger },
  replay: { bg: SPORTS_COLORS.plumSoft, fg: SPORTS_COLORS.plum },
};

function SportsStatusBadge({
  code,
  label,
  minute,
  size = "md",
  style,
}: SportsStatusBadgeProps) {
  const tone = statusTone(code);
  const text = formatStatusLabel(code, label);
  if (!text) return null;

  const toneStyle = TONE_STYLES[tone];
  const small = size === "sm";

  return (
    <View
      style={[
        styles.badge,
        small && styles.badgeSmall,
        { backgroundColor: toneStyle.bg },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {toneStyle.dot ? (
        <View style={[styles.dot, { backgroundColor: toneStyle.dot }]} />
      ) : null}
      <Text
        style={[styles.text, small && styles.textSmall, { color: toneStyle.fg }]}
        numberOfLines={1}
      >
        {text}
        {minute ? ` · ${minute}` : ""}
      </Text>
    </View>
  );
}

export default memo(SportsStatusBadge);

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  badgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },

  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  text: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  textSmall: {
    fontSize: 9.5,
  },
});
