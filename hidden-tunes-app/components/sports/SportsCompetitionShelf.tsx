import { memo } from "react";
import { View } from "react-native";

import { boundSectionItems, stableSportsKey } from "@/lib/sports/ui/homeSections";
import type { SportsCompetitionCard as SportsCompetitionCardType } from "@/types/sports";

import SportsCompetitionCard from "./SportsCompetitionCard";
import SportsHorizontalShelf from "./SportsHorizontalShelf";

type SportsCompetitionShelfProps = {
  sectionId?: string;
  competitions: SportsCompetitionCardType[];
  limit?: number;
  cardWidth?: number;
  onPress?: (competition: SportsCompetitionCardType) => void;
  onToggleFollow?: (competition: SportsCompetitionCardType) => void;
};

function SportsCompetitionShelf({
  sectionId = "popular_competitions",
  competitions,
  limit,
  cardWidth = 240,
  onPress,
  onToggleFollow,
}: SportsCompetitionShelfProps) {
  const items = boundSectionItems(competitions, limit);
  if (!items.length) return null;

  return (
    <SportsHorizontalShelf>
      {items.map((competition, index) => (
        <View key={stableSportsKey(sectionId, competition, index)} style={{ width: cardWidth }}>
          <SportsCompetitionCard
            competition={competition}
            onPress={onPress}
            onToggleFollow={onToggleFollow}
          />
        </View>
      ))}
    </SportsHorizontalShelf>
  );
}

export default memo(SportsCompetitionShelf);
