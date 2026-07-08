import { memo, useCallback } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "@/constants/theme";
import type { TvBrowseCategory } from "@/constants/tvBrowseCategories";

type TvBrowseCategoriesProps = {
  categories: TvBrowseCategory[];
  activeCategory?: string | null;
  onSelectCategory: (category: TvBrowseCategory) => void;
};

function TvBrowseCategories({
  categories,
  activeCategory,
  onSelectCategory,
}: TvBrowseCategoriesProps) {
  const renderChip = useCallback(
    (category: TvBrowseCategory) => {
      const isActive = activeCategory === category.slug;

      return (
        <TouchableOpacity
          key={category.id}
          activeOpacity={0.88}
          onPress={() => onSelectCategory(category)}
          style={[styles.chip, isActive && styles.chipActive]}
        >
          <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
            {category.name}
          </Text>
        </TouchableOpacity>
      );
    },
    [activeCategory, onSelectCategory]
  );

  const topLevel = categories.filter((category) => !category.parentSlug);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Browse TV</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {topLevel.map(renderChip)}
      </ScrollView>
    </View>
  );
}

export default memo(TvBrowseCategories);

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 18,
  },
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 10,
  },
  row: {
    paddingRight: 12,
    gap: 8,
  },
  chip: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.18)",
  },
  chipActive: {
    backgroundColor: "rgba(168,85,247,0.18)",
    borderColor: "rgba(168,85,247,0.42)",
  },
  chipText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  chipTextActive: {
    color: COLORS.text,
  },
});
