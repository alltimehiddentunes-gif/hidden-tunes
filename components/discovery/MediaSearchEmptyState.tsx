import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "../../constants/theme";
import { getRadioSearchSuggestions } from "../../utils/mediaSearchQueryExpansion";

type MediaSearchEmptyStateProps = {
  kind: "radio";
  query: string;
  includeMature?: boolean;
  onSuggestionPress: (suggestion: string) => void;
};

export default function MediaSearchEmptyState({
  kind,
  query,
  includeMature = false,
  onSuggestionPress,
}: MediaSearchEmptyStateProps) {
  const suggestions = getRadioSearchSuggestions(includeMature);

  return (
    <View style={styles.container}>
      <Ionicons name="radio-outline" size={48} color={COLORS.textMuted} />
      <Text style={styles.title}>
        {query
          ? "We couldn't find an exact match. Try one of these popular searches."
          : "Search live stations"}
      </Text>
      {query ? (
        <Text style={styles.subtitle}>
          No exact results for "{query}". These picks often surface great stations.
        </Text>
      ) : null}
      <View style={styles.chips}>
        {suggestions.map((suggestion) => (
          <TouchableOpacity
            key={suggestion}
            style={styles.chip}
            activeOpacity={0.85}
            onPress={() => onSuggestionPress(suggestion)}
          >
            <Text style={styles.chipText}>{suggestion}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 12,
    gap: 10,
  },
  title: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 22,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.14)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.28)",
  },
  chipText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
});
