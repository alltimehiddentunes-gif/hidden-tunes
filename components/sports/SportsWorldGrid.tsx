import { memo } from "react";

import { boundSectionItems, stableSportsKey } from "@/lib/sports/ui/homeSections";
import type { SportsWorldCard as SportsWorldCardType } from "@/types/sports";

import SportsGridSection from "./SportsGridSection";
import SportsWorldCard from "./SportsWorldCard";

type SportsWorldGridProps = {
  sectionId?: string;
  sports: SportsWorldCardType[];
  limit?: number;
  columns?: number;
  onPress?: (sport: SportsWorldCardType) => void;
};

function SportsWorldGrid({
  sectionId = "browse_sports",
  sports,
  limit,
  columns = 2,
  onPress,
}: SportsWorldGridProps) {
  const items = boundSectionItems(sports, limit);
  if (!items.length) return null;

  return (
    <SportsGridSection columns={columns}>
      {items.map((sport, index) => (
        <SportsWorldCard key={stableSportsKey(sectionId, sport, index)} sport={sport} onPress={onPress} />
      ))}
    </SportsGridSection>
  );
}

export default memo(SportsWorldGrid);
