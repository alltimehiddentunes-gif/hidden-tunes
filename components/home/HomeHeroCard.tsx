import React, { memo } from "react";
import { Text, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { useTrackPlaybackStatus } from "../../context/playerContextSlices";
import { COLORS, GRADIENTS } from "../../constants/theme";
import type { HiddenTunesNormalizedSong } from "../../services/hiddenTunesApi";
import HTImage from "../HTImage";
import NeonEQ from "../NeonEQ";

export type HomeHeroCardData = {
  key: string;
  label: string;
  title: string;
  subtitle: string;
  song: HiddenTunesNormalizedSong;
  icon: keyof typeof Ionicons.glyphMap;
  isCurrent?: boolean;
};

type HomeHeroCardProps = {
  item: HomeHeroCardData;
  index: number;
  heroCardWidth: number;
  heroCardHeight: number;
  totalCards: number;
  activeSlideIndex: number;
  heroActionLabels: {
    nowPlayingActive: string;
    openPlayer: string;
    play: string;
  };
  onPress: (item: HomeHeroCardData) => void;
  HeroPressable: React.ComponentType<{
    height: number;
    isActive: boolean;
    onPress: () => void;
    children: React.ReactNode;
  }>;
  LuxuryPulse: React.ComponentType<{ style: object }>;
  styles: {
    heroSlide: object;
    heroBorder: object;
    heroInner: object;
    heroArtworkPanel: object;
    heroArtworkAura: object;
    heroArtworkImage: object;
    heroArtworkFade: object;
    heroTextScrim: object;
    heroTextBlock: object;
    livePill: object;
    liveText: object;
    heroSong: object;
    heroArtist: object;
    heroBottomRow: object;
    heroPlayButton: object;
    heroPlayText: object;
    heroCountPill: object;
    heroCountText: object;
  };
};

export const HomeHeroCard = memo(function HomeHeroCard({
  item,
  index,
  heroCardWidth,
  heroCardHeight,
  totalCards,
  activeSlideIndex,
  heroActionLabels,
  onPress,
  HeroPressable,
  LuxuryPulse,
  styles,
}: HomeHeroCardProps) {
  const { isActive, isPlaying } = useTrackPlaybackStatus(String(item.song?.id || ""));

  return (
    <View style={[styles.heroSlide, { width: heroCardWidth }]}>
      <LinearGradient colors={GRADIENTS.neon} style={styles.heroBorder}>
        <HeroPressable
          height={heroCardHeight}
          isActive={isActive || index === activeSlideIndex}
          onPress={() => onPress(item)}
        >
          <View style={styles.heroInner}>
            <View style={styles.heroArtworkPanel}>
              <LuxuryPulse style={styles.heroArtworkAura} />
              <HTImage
                source={item.song}
                style={styles.heroArtworkImage}
                contentFit="cover"
                contentPosition="center"
                prefetch
              />
              <LinearGradient
                pointerEvents="none"
                colors={["transparent", "rgba(0,0,0,0.18)", "rgba(0,0,0,0.55)"]}
                style={styles.heroArtworkFade}
              />
            </View>

            <LinearGradient
              pointerEvents="none"
              colors={["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.88)"]}
              style={styles.heroTextScrim}
            />

            <View style={styles.heroTextBlock}>
              <View style={styles.livePill}>
                {isActive ? (
                  <NeonEQ isPlaying={isPlaying} size="small" />
                ) : (
                  <Ionicons name={item.icon} size={12} color={COLORS.primary} />
                )}
                <Text style={styles.liveText}>
                  {isActive ? heroActionLabels.nowPlayingActive : item.label}
                </Text>
              </View>

              <Text numberOfLines={2} ellipsizeMode="tail" style={styles.heroSong}>
                {item.title}
              </Text>
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.heroArtist}>
                {item.subtitle}
              </Text>

              <View style={styles.heroBottomRow}>
                <View style={styles.heroPlayButton}>
                  <Ionicons
                    name={isActive && isPlaying ? "pause" : "play"}
                    size={16}
                    color="#000"
                  />
                  <Text style={styles.heroPlayText}>
                    {isActive ? heroActionLabels.openPlayer : heroActionLabels.play}
                  </Text>
                </View>

                {totalCards > 1 ? (
                  <View style={styles.heroCountPill}>
                    <Text style={styles.heroCountText}>
                      {index + 1}/{totalCards}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </HeroPressable>
      </LinearGradient>
    </View>
  );
});
