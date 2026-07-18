import { memo } from "react";

import { boundSectionItems, stableSportsKey } from "@/lib/sports/ui/homeSections";
import type { SportsCompetitionCard as SportsCompetitionCardType } from "@/types/sports";

import SportsCompetitionCard from "./SportsCompetitionCard";
import SportsGridSection from "./SportsGridSection";

type SportsCompetitionShelfProps = {
  sectionId?: string;
  competitions: SportsCompetitionCardType[];
  limit?: number;
  /** @deprecated Ignored — competitions always use a vertical grid. */
  cardWidth?: number;
  columns?: number;
  onPress?: (competition: SportsCompetitionCardType) => void;
  onToggleFollow?: (competition: SportsCompetitionCardType) => void;
};

function SportsCompetitionShelf({
  sectionId = "popular_competitions",
  competitions,
  limit,
  columns = 2,
  onPress,
  onToggleFollow,
}: SportsCompetitionShelfProps) {
  const items = boundSectionItems(competitions, limit);
  if (!items.length) return null;

  return (
    <SportsGridSection columns={columns} testID="sports-competition-grid">
      {items.map((competition, index) => (
        <SportsCompetitionCard
          key={stableSportsKey(sectionId, competition, index)}
          competition={competition}
          onPress={onPress}
          onToggleFollow={onToggleFollow}
        />
      ))}
    </SportsGridSection>
  );
}

export default memo(SportsCompetitionShelf);
