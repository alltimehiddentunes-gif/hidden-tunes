import { memo } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { StyleSheet, View } from "react-native";

import MiniPlayer from "../../components/MiniPlayer";
import PerformanceOverlay from "../../components/PerformanceOverlay";

type TabIconProps = {
  focused: boolean;
  color: string;
  activeColor: string;
  activeBg: string;
  activeName: keyof typeof Ionicons.glyphMap;
  inactiveName: keyof typeof Ionicons.glyphMap;
};

function TabIcon({
  focused,
  color,
  activeColor,
  activeBg,
  activeName,
  inactiveName,
}: TabIconProps) {
  return (
    <View
      style={[
        styles.iconWrap,
        focused && {
          backgroundColor: activeBg,
        },
      ]}
    >
      <Ionicons
        name={focused ? activeName : inactiveName}
        size={24}
        color={focused ? activeColor : color}
      />
    </View>
  );
}

const MemoTabIcon = memo(TabIcon);

export default function TabLayout() {
  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,

          tabBarActiveTintColor: "#ffffff",
          tabBarInactiveTintColor: "#7e7e7e",

          tabBarBackground: () => (
            <BlurView intensity={76} tint="dark" style={styles.tabBarBackground} />
          ),

          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarItemStyle: styles.tabBarItem,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }) => (
              <MemoTabIcon
                focused={focused}
                color={color}
                activeColor="#ff0033"
                activeBg="rgba(255,0,51,0.16)"
                activeName="home"
                inactiveName="home-outline"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="explore"
          options={{
            title: "Explore",
            tabBarIcon: ({ color, focused }) => (
              <MemoTabIcon
                focused={focused}
                color={color}
                activeColor="#a855f7"
                activeBg="rgba(168,85,247,0.18)"
                activeName="compass"
                inactiveName="compass-outline"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="player"
          options={{
            title: "Player",
            href: "/player",
            tabBarIcon: ({ color, focused }) => (
              <MemoTabIcon
                focused={focused}
                color={color}
                activeColor="#ff0033"
                activeBg="rgba(255,0,51,0.16)"
                activeName="play-circle"
                inactiveName="play-circle-outline"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="favorites"
          options={{
            title: "Library",
            tabBarIcon: ({ color, focused }) => (
              <MemoTabIcon
                focused={focused}
                color={color}
                activeColor="#ff0066"
                activeBg="rgba(255,0,102,0.16)"
                activeName="heart"
                inactiveName="heart-outline"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="tv"
          options={{
            title: "TV",
            tabBarIcon: ({ color, focused }) => (
              <MemoTabIcon
                focused={focused}
                color={color}
                activeColor="#ff0033"
                activeBg="rgba(255,0,51,0.18)"
                activeName="tv"
                inactiveName="tv-outline"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, focused }) => (
              <MemoTabIcon
                focused={focused}
                color={color}
                activeColor="#22d3ee"
                activeBg="rgba(34,211,238,0.16)"
                activeName="person"
                inactiveName="person-outline"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="queue"
          options={{
            href: null,
          }}
        />

        <Tabs.Screen
          name="search"
          options={{
            href: null,
          }}
        />
      </Tabs>

      <MiniPlayer />
      <PerformanceOverlay />
    </>
  );
}

const styles = StyleSheet.create({
  tabBarBackground: {
    flex: 1,
    borderRadius: 40,
    overflow: "hidden",
  },

  tabBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 16,
    height: 82,
    borderRadius: 40,
    borderTopWidth: 0,
    backgroundColor: "rgba(5,5,5,0.92)",
    overflow: "hidden",
    elevation: 0,
    paddingTop: 8,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  tabBarLabel: {
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 4,
    letterSpacing: 0.4,
  },

  tabBarItem: {
    borderRadius: 30,
    marginHorizontal: 2,
  },

  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
});