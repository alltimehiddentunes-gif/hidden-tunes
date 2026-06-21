import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { COLORS } from "../../constants/theme";
import { isMatureContentItem, type MatureContentFields } from "../../types/matureContent";

type MatureContentBadgeProps = {
  item?: MatureContentFields | null;
};

function MatureContentBadge({ item }: MatureContentBadgeProps) {
  if (!isMatureContentItem(item)) return null;

  return (
    <View style={styles.badge}>
      <Text style={styles.text}>18+</Text>
    </View>
  );
}

export default memo(MatureContentBadge);

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(244,114,182,0.16)",
    borderWidth: 1,
    borderColor: "rgba(244,114,182,0.35)",
  },
  text: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
});
