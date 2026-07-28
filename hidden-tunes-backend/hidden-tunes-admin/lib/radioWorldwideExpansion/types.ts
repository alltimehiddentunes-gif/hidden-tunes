export type WorldwideRadioCountry = {
  code: string;
  name: string;
  continent: WorldwideContinentId;
  aliases?: string[];
  cities?: string[];
  states?: string[];
  languages?: string[];
  tags?: string[];
  /** Antarctica / special: note that only lawful public research/educational feeds apply */
  notes?: string[];
};

export type WorldwideContinentId =
  | "africa"
  | "europe"
  | "north_america"
  | "south_america"
  | "asia"
  | "oceania"
  | "antarctica";

export const WORLDWIDE_CONTINENT_ORDER: WorldwideContinentId[] = [
  "africa",
  "europe",
  "north_america",
  "south_america",
  "asia",
  "oceania",
  "antarctica",
];
