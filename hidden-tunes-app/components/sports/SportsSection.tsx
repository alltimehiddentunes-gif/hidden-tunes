import { Component, memo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";

import SportsErrorState from "./SportsErrorState";

type SportsSectionProps = {
  title: string;
  subtitle?: string | null;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  /** External loading flag — renders `loadingContent` instead of children. */
  loading?: boolean;
  loadingContent?: ReactNode;
  /** External error message — renders an isolated error state instead of children. */
  error?: string | null;
  onRetry?: () => void;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

type BoundaryProps = { children: ReactNode };
type BoundaryState = { crashed: boolean };

/** Catches render errors thrown by a single section so one bad shelf never takes down the page. */
class SectionErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch() {
    // Swallow — isolated section error state is rendered below.
  }

  handleRetry = () => {
    this.setState({ crashed: false });
  };

  render() {
    if (this.state.crashed) {
      return (
        <SportsErrorState compact message="This section could not be displayed." onRetry={this.handleRetry} />
      );
    }
    return this.props.children;
  }
}

function SportsSection({
  title,
  subtitle,
  onSeeAll,
  seeAllLabel = "See All",
  loading = false,
  loadingContent,
  error,
  onRetry,
  children,
  style,
  contentStyle,
}: SportsSectionProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {onSeeAll && !error ? (
          <Pressable
            onPress={onSeeAll}
            style={styles.seeAllButton}
            accessibilityRole="button"
            accessibilityLabel={`${seeAllLabel}, ${title}`}
            hitSlop={6}
          >
            <Text style={styles.seeAllText}>{seeAllLabel}</Text>
            <Ionicons name="chevron-forward" size={14} color={SPORTS_COLORS.amber} />
          </Pressable>
        ) : null}
      </View>

      <View style={contentStyle}>
        {error ? (
          <SportsErrorState compact message={error} onRetry={onRetry} />
        ) : loading ? (
          loadingContent ?? null
        ) : (
          <SectionErrorBoundary>{children}</SectionErrorBoundary>
        )}
      </View>
    </View>
  );
}

export default memo(SportsSection);

const styles = StyleSheet.create({
  container: {
    marginBottom: 26,
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    marginBottom: 14,
    gap: 12,
  },

  headerCopy: {
    flex: 1,
  },

  title: {
    color: SPORTS_COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },

  subtitle: {
    color: SPORTS_COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },

  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    minHeight: 32,
    paddingHorizontal: 4,
  },

  seeAllText: {
    color: SPORTS_COLORS.amber,
    fontSize: 12.5,
    fontWeight: "800",
  },
});
