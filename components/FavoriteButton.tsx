import { memo, useCallback } from "react";
import { StyleSheet, TouchableOpacity } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "../constants/theme";
import { useFavorites } from "../hooks/useFavorites";
import type { FavoriteItemType, UnifiedFavoriteItem } from "../types/favorites";

type FavoriteButtonProps = {
  item: UnifiedFavoriteItem;
  size?: number;
  color?: string;
  activeColor?: string;
  hitSlop?: number;
};

function FavoriteButton({
  item,
  size = 22,
  color = COLORS.textMuted,
  activeColor = COLORS.pink,
  hitSlop = 8,
}: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();

  if (!item?.id || !item?.type) {
    return null;
  }

  const favorited = isFavorite(item.type, item.id);

  const handlePress = useCallback(() => {
    void toggleFavorite(item);
  }, [item, toggleFavorite]);

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      style={styles.button}
      onPress={handlePress}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={favorited ? "Remove from favorites" : "Add to favorites"}
    >
      <Ionicons
        name={favorited ? "heart" : "heart-outline"}
        size={size}
        color={favorited ? activeColor : color}
      />
    </TouchableOpacity>
  );
}

export default memo(FavoriteButton);

type FavoriteToggleButtonProps = {
  type: FavoriteItemType;
  id: string;
  buildItem: () => UnifiedFavoriteItem | null;
  size?: number;
  color?: string;
  activeColor?: string;
};

export const FavoriteToggleButton = memo(function FavoriteToggleButton({
  type,
  id,
  buildItem,
  size,
  color,
  activeColor,
}: FavoriteToggleButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();

  if (!id || !type) {
    return null;
  }

  const favorited = isFavorite(type, id);

  const handlePress = useCallback(() => {
    const item = buildItem();
    if (!item) return;
    void toggleFavorite(item);
  }, [buildItem, toggleFavorite]);

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      style={styles.button}
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={favorited ? "Remove from favorites" : "Add to favorites"}
    >
      <Ionicons
        name={favorited ? "heart" : "heart-outline"}
        size={size || 22}
        color={favorited ? activeColor || COLORS.pink : color || COLORS.textMuted}
      />
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});
