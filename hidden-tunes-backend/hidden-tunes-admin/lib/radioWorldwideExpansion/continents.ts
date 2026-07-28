import {
  AFRICA_WORLDWIDE_QUEUE,
  ANTARCTICA_RADIO_QUEUE,
  ASIA_RADIO_QUEUE,
  EUROPE_RADIO_QUEUE,
  getContinentQueue as getQueueFromCountries,
  getWorldwideCountry as getCountryFromCountries,
  NORTH_AMERICA_RADIO_QUEUE,
  OCEANIA_RADIO_QUEUE,
  SOUTH_AMERICA_RADIO_QUEUE,
} from "@/lib/radioWorldwideExpansion/countries";
import type { WorldwideContinentId, WorldwideRadioCountry } from "@/lib/radioWorldwideExpansion/types";
import { WORLDWIDE_CONTINENT_ORDER } from "@/lib/radioWorldwideExpansion/types";

export type WorldwideContinentMeta = {
  id: WorldwideContinentId;
  name: string;
  /** Africa uses completed radioAfricaExpansion; adapted into worldwide shape. */
  queue: WorldwideRadioCountry[];
  /** Optional operational note for operators / UI. */
  note?: string;
};

export const WORLDWIDE_CONTINENTS: WorldwideContinentMeta[] = [
  {
    id: "africa",
    name: "Africa",
    queue: AFRICA_WORLDWIDE_QUEUE,
    note: "Completed via radioAfricaExpansion; re-exported here with continent field mapped.",
  },
  {
    id: "europe",
    name: "Europe",
    queue: EUROPE_RADIO_QUEUE,
  },
  {
    id: "north_america",
    name: "North America",
    queue: NORTH_AMERICA_RADIO_QUEUE,
  },
  {
    id: "south_america",
    name: "South America",
    queue: SOUTH_AMERICA_RADIO_QUEUE,
  },
  {
    id: "asia",
    name: "Asia",
    queue: ASIA_RADIO_QUEUE,
  },
  {
    id: "oceania",
    name: "Oceania",
    queue: OCEANIA_RADIO_QUEUE,
  },
  {
    id: "antarctica",
    name: "Antarctica",
    queue: ANTARCTICA_RADIO_QUEUE,
    note: "Research/scientific/educational continuous official feeds only.",
  },
];

export function getContinentMeta(continent: WorldwideContinentId): WorldwideContinentMeta | undefined {
  return WORLDWIDE_CONTINENTS.find((c) => c.id === continent);
}

export function getContinentQueue(continent: WorldwideContinentId): WorldwideRadioCountry[] {
  return getQueueFromCountries(continent);
}

export function getWorldwideCountry(
  continent: WorldwideContinentId,
  code: string
): WorldwideRadioCountry | undefined {
  return getCountryFromCountries(continent, code);
}

export function continentDisplayName(continent: WorldwideContinentId): string {
  return getContinentMeta(continent)?.name || continent;
}

export function worldwideContinentCountryCounts(): Record<WorldwideContinentId, number> {
  const counts = {} as Record<WorldwideContinentId, number>;
  for (const id of WORLDWIDE_CONTINENT_ORDER) {
    counts[id] = getContinentQueue(id).length;
  }
  return counts;
}
