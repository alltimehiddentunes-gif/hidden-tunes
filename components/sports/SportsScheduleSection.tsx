import { Fragment, memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";
import { stableSportsKey } from "@/lib/sports/ui/homeSections";
import { statusTone } from "@/lib/sports/ui/formatStatus";
import type { SportsMatchCard as SportsMatchCardType } from "@/types/sports";

import SportsEmptyState from "./SportsEmptyState";
import SportsMatchCard from "./SportsMatchCard";
import SportsScheduleRow from "./SportsScheduleRow";

export type SportsScheduleDateOption = "yesterday" | "today" | "tomorrow";

const DATE_OPTIONS: { key: SportsScheduleDateOption; label: string }[] = [
  { key: "yesterday", label: "Yesterday" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
];

type ScheduleGroupKey = "live" | "soon" | "later" | "finished";

const GROUP_TITLES: Record<ScheduleGroupKey, string> = {
  live: "Live",
  soon: "Starting Soon",
  later: "Later Today",
  finished: "Finished",
};

const GROUP_ORDER: ScheduleGroupKey[] = ["live", "soon", "later", "finished"];

function classifyMatch(card: SportsMatchCardType): ScheduleGroupKey {
  const tone = statusTone(card.status?.code);
  if (tone === "live") return "live";
  if (tone === "soon") return "soon";
  if (tone === "finished" || tone === "replay") return "finished";
  return "later";
}

type SportsScheduleSectionProps = {
  matches: SportsMatchCardType[];
  nowMs?: number;
  selectedDate?: SportsScheduleDateOption;
  onDateChange?: (date: SportsScheduleDateOption) => void;
  rowVariant?: "compact" | "detailed";
  remindedIds?: string[];
  favoritedIds?: string[];
  onPressMatch?: (card: SportsMatchCardType) => void;
  onWatch?: (card: SportsMatchCardType) => void;
  onRemind?: (card: SportsMatchCardType) => void;
  onSave?: (card: SportsMatchCardType) => void;
  emptyMessage?: string;
};

function SportsScheduleSection({
  matches,
  nowMs,
  selectedDate,
  onDateChange,
  rowVariant = "compact",
  remindedIds,
  favoritedIds,
  onPressMatch,
  onWatch,
  onRemind,
  onSave,
  emptyMessage = "No fixtures for this day.",
}: SportsScheduleSectionProps) {
  const remindedSet = useMemo(() => new Set(remindedIds || []), [remindedIds]);
  const favoritedSet = useMemo(() => new Set(favoritedIds || []), [favoritedIds]);

  const groups = useMemo(() => {
    const buckets: Record<ScheduleGroupKey, SportsMatchCardType[]> = {
      live: [],
      soon: [],
      later: [],
      finished: [],
    };
    for (const card of matches) {
      buckets[classifyMatch(card)].push(card);
    }
    return buckets;
  }, [matches]);

  const handleDateChange = useCallback(
    (date: SportsScheduleDateOption) => {
      onDateChange?.(date);
    },
    [onDateChange]
  );

  const hasAny = matches.length > 0;

  return (
    <View style={styles.container}>
      {onDateChange ? (
        <View style={styles.dateSelector}>
          {DATE_OPTIONS.map((option) => {
            const active = selectedDate === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => handleDateChange(option.key)}
                style={[styles.dateChip, active && styles.dateChipActive]}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.dateChipText, active && styles.dateChipTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!hasAny ? (
        <SportsEmptyState icon="calendar-outline" title="No matches scheduled" message={emptyMessage} />
      ) : (
        GROUP_ORDER.map((groupKey) => {
          const items = groups[groupKey];
          if (!items.length) return null;

          return (
            <View key={groupKey} style={styles.group}>
              <View style={styles.groupHeader}>
                {groupKey === "live" ? <View style={styles.liveDot} /> : null}
                <Text style={styles.groupTitle}>{GROUP_TITLES[groupKey]}</Text>
                <Text style={styles.groupCount}>{items.length}</Text>
              </View>

              <View style={rowVariant === "compact" ? styles.rowList : styles.cardList}>
                {items.map((card, index) => (
                  <Fragment key={stableSportsKey(groupKey, card, index)}>
                    {rowVariant === "compact" ? (
                      <SportsScheduleRow card={card} nowMs={nowMs} onPress={onPressMatch} />
                    ) : (
                      <SportsMatchCard
                        card={card}
                        variant="schedule"
                        nowMs={nowMs}
                        reminded={remindedSet.has(card.id)}
                        favorited={favoritedSet.has(card.id)}
                        onPress={onPressMatch}
                        onWatch={onWatch}
                        onRemind={onRemind}
                        onSave={onSave}
                      />
                    )}
                    {rowVariant === "compact" && index < items.length - 1 ? (
                      <View style={styles.divider} />
                    ) : null}
                  </Fragment>
                ))}
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

export default memo(SportsScheduleSection);

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },

  dateSelector: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    marginBottom: 16,
  },

  dateChip: {
    minHeight: 36,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
  },

  dateChipActive: {
    backgroundColor: SPORTS_COLORS.amber,
    borderColor: SPORTS_COLORS.amber,
  },

  dateChipText: {
    color: SPORTS_COLORS.textMuted,
    fontSize: 12.5,
    fontWeight: "800",
  },

  dateChipTextActive: {
    color: "#0A0A0A",
  },

  group: {
    marginBottom: 18,
  },

  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    marginBottom: 8,
  },

  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: SPORTS_COLORS.live,
  },

  groupTitle: {
    color: SPORTS_COLORS.text,
    fontSize: 13.5,
    fontWeight: "900",
  },

  groupCount: {
    color: SPORTS_COLORS.textDim,
    fontSize: 12,
    fontWeight: "700",
  },

  rowList: {
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: SPORTS_COLORS.surface,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
  },

  divider: {
    height: 1,
    backgroundColor: SPORTS_COLORS.border,
  },

  cardList: {
    paddingHorizontal: 18,
    gap: 10,
  },
});
