import { AFRICA_RADIO_QUEUE } from "@/lib/radioAfricaExpansion/africanCountries";
import type { WorldwideContinentId, WorldwideRadioCountry } from "@/lib/radioWorldwideExpansion/types";

import { ANTARCTICA_RADIO_QUEUE } from "./antarctica";
import { ASIA_RADIO_QUEUE } from "./asia";
import { EUROPE_RADIO_QUEUE } from "./europe";
import { NORTH_AMERICA_RADIO_QUEUE } from "./northAmerica";
import { OCEANIA_RADIO_QUEUE } from "./oceania";
import { SOUTH_AMERICA_RADIO_QUEUE } from "./southAmerica";

export { EUROPE_RADIO_QUEUE } from "./europe";
export { NORTH_AMERICA_RADIO_QUEUE } from "./northAmerica";
export { SOUTH_AMERICA_RADIO_QUEUE } from "./southAmerica";
export { ASIA_RADIO_QUEUE } from "./asia";
export { OCEANIA_RADIO_QUEUE } from "./oceania";
export { ANTARCTICA_RADIO_QUEUE } from "./antarctica";

/**
 * Africa is already completed via radioAfricaExpansion.
 * Adapted here for worldwide continent helpers without modifying Africa files.
 */
export const AFRICA_WORLDWIDE_QUEUE: WorldwideRadioCountry[] = AFRICA_RADIO_QUEUE.map(
  (country) => ({
    ...country,
    continent: "africa" as const,
  })
);

const QUEUE_BY_CONTINENT: Record<WorldwideContinentId, WorldwideRadioCountry[]> = {
  africa: AFRICA_WORLDWIDE_QUEUE,
  europe: EUROPE_RADIO_QUEUE,
  north_america: NORTH_AMERICA_RADIO_QUEUE,
  south_america: SOUTH_AMERICA_RADIO_QUEUE,
  asia: ASIA_RADIO_QUEUE,
  oceania: OCEANIA_RADIO_QUEUE,
  antarctica: ANTARCTICA_RADIO_QUEUE,
};

export function getContinentQueue(continent: WorldwideContinentId): WorldwideRadioCountry[] {
  return QUEUE_BY_CONTINENT[continent] || [];
}

export function getWorldwideCountry(
  continent: WorldwideContinentId,
  code: string
): WorldwideRadioCountry | undefined {
  const normalized = code.trim().toUpperCase();
  return getContinentQueue(continent).find((c) => c.code.toUpperCase() === normalized);
}

export function allWorldwideCountries(): WorldwideRadioCountry[] {
  return [
    ...AFRICA_WORLDWIDE_QUEUE,
    ...EUROPE_RADIO_QUEUE,
    ...NORTH_AMERICA_RADIO_QUEUE,
    ...SOUTH_AMERICA_RADIO_QUEUE,
    ...ASIA_RADIO_QUEUE,
    ...OCEANIA_RADIO_QUEUE,
    ...ANTARCTICA_RADIO_QUEUE,
  ];
}
