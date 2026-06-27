import { StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "../../constants/theme";

type PodcastSearchBarProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
};

export default function PodcastSearchBar({
  value,
  onChangeText,
  placeholder = "Search podcasts, shows, languages...",
}: PodcastSearchBarProps) {
  return (
    <View style={styles.bar}>
      <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    padding: 0,
  },
});
