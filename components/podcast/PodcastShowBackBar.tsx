import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "../../constants/theme";
import { navigatePodcastBack } from "../../utils/podcastNavigation";

export default function PodcastShowBackBar() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity
        onPress={() => navigatePodcastBack("/podcasts")}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={24} color={COLORS.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 18,
    paddingBottom: 4,
  },
  backButton: {
    alignSelf: "flex-start",
    padding: 4,
  },
});
