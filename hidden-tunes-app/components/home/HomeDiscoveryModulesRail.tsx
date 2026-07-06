import { memo, useCallback, useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import {
  HOME_DISCOVERY_MODULE_RAILS,
  type DiscoveryShortcut,
} from "../../constants/discoveryShortcuts";
import { COLORS } from "../../constants/theme";
import { getHorizontalListPerformanceSettings } from "../../utils/performanceMode";
import { HomePremiumShortcut } from "./HomePremiumShortcut";

type HomeDiscoveryModulesRailProps = {
  modules?: DiscoveryShortcut[];
};

export const HomeDiscoveryModulesRail = memo(function HomeDiscoveryModulesRail({
  modules = HOME_DISCOVERY_MODULE_RAILS,
}: HomeDiscoveryModulesRailProps) {
  const listTuning = useMemo(
    () => getHorizontalListPerformanceSettings(modules.length),
    [modules.length]
  );

  const openModule = useCallback((route: string) => {
    router.push(route as any);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: DiscoveryShortcut }) => (
      <HomePremiumShortcut
        layout="quarter"
        icon={item.icon}
        title={item.title}
        color={item.color}
        onPress={() => openModule(item.route)}
      />
    ),
    [openModule]
  );

  if (!modules.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Discover Hidden Tunes</Text>
      <FlatList
        horizontal
        data={modules}
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        nestedScrollEnabled
        initialNumToRender={listTuning.initialNumToRender}
        maxToRenderPerBatch={listTuning.maxToRenderPerBatch}
        windowSize={listTuning.windowSize}
        updateCellsBatchingPeriod={listTuning.updateCellsBatchingPeriod}
        removeClippedSubviews={listTuning.removeClippedSubviews}
        renderItem={renderItem}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginTop: 24,
  },
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    paddingHorizontal: 20,
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  rail: {
    paddingLeft: 20,
    paddingRight: 28,
    gap: 12,
    paddingBottom: 4,
  },
});
