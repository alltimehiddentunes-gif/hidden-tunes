import { memo } from "react";

import { boundSectionItems } from "@/lib/sports/ui/homeSections";
import type { SportsCountryCard as SportsCountryCardType } from "@/types/sports";

import SportsCountryCard from "./SportsCountryCard";
import SportsGridSection from "./SportsGridSection";

type SportsCountryGridProps = {
  countries: SportsCountryCardType[];
  limit?: number;
  columns?: number;
  onPress?: (country: SportsCountryCardType) => void;
};

function SportsCountryGrid({ countries, limit, columns = 2, onPress }: SportsCountryGridProps) {
  const items = boundSectionItems(countries, limit);
  if (!items.length) return null;

  return (
    <SportsGridSection columns={columns}>
      {items.map((country, index) => (
        <SportsCountryCard key={`${country.code}:${index}`} country={country} onPress={onPress} />
      ))}
    </SportsGridSection>
  );
}

export default memo(SportsCountryGrid);
