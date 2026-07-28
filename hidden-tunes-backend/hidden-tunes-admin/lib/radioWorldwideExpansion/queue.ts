import fs from "node:fs";
import path from "node:path";

import { getContinentQueue } from "@/lib/radioWorldwideExpansion/continents";
import type { WorldwideContinentId, WorldwideRadioCountry } from "@/lib/radioWorldwideExpansion/types";
import { WORLDWIDE_CONTINENT_ORDER } from "@/lib/radioWorldwideExpansion/types";

export type WorldwideCountryDiscoveryStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked";

export type WorldwideCountryQueueEntry = {
  country: string;
  code: string;
  continent: WorldwideContinentId;
  discovery_status: WorldwideCountryDiscoveryStatus;
  sources_searched: string[];
  candidates_discovered: number;
  candidates_tested: number;
  imported: number;
  updated: number;
  restored: number;
  duplicates: number;
  quarantined: number;
  rejected: number;
  public_playable_total: number;
  mature_public_total: number;
  last_completed_at: string | null;
  next_verification_at: string | null;
  unresolved_blockers: string[];
  notes?: string[];
};

export type WorldwideContinentQueueState = {
  version: 1;
  continent: WorldwideContinentId;
  created_at: string;
  updated_at: string;
  current_country_code: string | null;
  countries: WorldwideCountryQueueEntry[];
};

export type WorldwideMasterReport = {
  version: 1;
  created_at: string;
  updated_at: string;
  continents: Record<
    WorldwideContinentId,
    {
      display_name: string;
      country_count: number;
      completed: number;
      pending: number;
      in_progress: number;
      blocked: number;
      imported: number;
      public_playable_total: number;
    }
  >;
};

function defaultEntry(country: WorldwideRadioCountry): WorldwideCountryQueueEntry {
  return {
    country: country.name,
    code: country.code,
    continent: country.continent,
    discovery_status: "pending",
    sources_searched: [],
    candidates_discovered: 0,
    candidates_tested: 0,
    imported: 0,
    updated: 0,
    restored: 0,
    duplicates: 0,
    quarantined: 0,
    rejected: 0,
    public_playable_total: 0,
    mature_public_total: 0,
    last_completed_at: null,
    next_verification_at: null,
    unresolved_blockers: [],
    notes: country.notes ? [...country.notes] : [],
  };
}

export function continentQueuePath(adminRoot: string, continent: WorldwideContinentId) {
  return path.join(adminRoot, "data", `radio-${continent}-expansion-queue.json`);
}

export function worldwideMasterReportPath(adminRoot: string) {
  return path.join(adminRoot, "data", "radio-worldwide-master-report.json");
}

export function loadContinentRadioQueue(
  adminRoot: string,
  continent: WorldwideContinentId
): WorldwideContinentQueueState {
  const filePath = continentQueuePath(adminRoot, continent);
  const queue = getContinentQueue(continent);
  if (!fs.existsSync(filePath)) {
    const now = new Date().toISOString();
    return {
      version: 1,
      continent,
      created_at: now,
      updated_at: now,
      current_country_code: null,
      countries: queue.map(defaultEntry),
    };
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as WorldwideContinentQueueState;
  const byCode = new Map(parsed.countries.map((c) => [c.code.toUpperCase(), c]));
  const countries = queue.map((country) => {
    const existing = byCode.get(country.code.toUpperCase());
    return existing
      ? {
          ...defaultEntry(country),
          ...existing,
          country: country.name,
          code: country.code,
          continent: country.continent,
        }
      : defaultEntry(country);
  });
  return {
    version: 1,
    continent,
    created_at: parsed.created_at || new Date().toISOString(),
    updated_at: parsed.updated_at || new Date().toISOString(),
    current_country_code: parsed.current_country_code || null,
    countries,
  };
}

export function saveContinentRadioQueue(
  adminRoot: string,
  state: WorldwideContinentQueueState
) {
  const filePath = continentQueuePath(adminRoot, state.continent);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  state.updated_at = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

export function getWorldwideQueueEntry(
  state: WorldwideContinentQueueState,
  code: string
): WorldwideCountryQueueEntry | undefined {
  return state.countries.find((c) => c.code.toUpperCase() === code.toUpperCase());
}

const CONTINENT_DISPLAY_NAMES: Record<WorldwideContinentId, string> = {
  africa: "Africa",
  europe: "Europe",
  north_america: "North America",
  south_america: "South America",
  asia: "Asia",
  oceania: "Oceania",
  antarctica: "Antarctica",
};

export function buildWorldwideMasterReport(adminRoot: string): WorldwideMasterReport {
  const now = new Date().toISOString();
  const continents = {} as WorldwideMasterReport["continents"];

  for (const continent of WORLDWIDE_CONTINENT_ORDER) {
    const state = loadContinentRadioQueue(adminRoot, continent);
    continents[continent] = {
      display_name: CONTINENT_DISPLAY_NAMES[continent],
      country_count: state.countries.length,
      completed: state.countries.filter((c) => c.discovery_status === "completed").length,
      pending: state.countries.filter((c) => c.discovery_status === "pending").length,
      in_progress: state.countries.filter((c) => c.discovery_status === "in_progress").length,
      blocked: state.countries.filter((c) => c.discovery_status === "blocked").length,
      imported: state.countries.reduce((sum, c) => sum + c.imported, 0),
      public_playable_total: state.countries.reduce((sum, c) => sum + c.public_playable_total, 0),
    };
  }

  return {
    version: 1,
    created_at: now,
    updated_at: now,
    continents,
  };
}

export function loadWorldwideMasterReport(adminRoot: string): WorldwideMasterReport {
  const filePath = worldwideMasterReportPath(adminRoot);
  if (!fs.existsSync(filePath)) {
    return buildWorldwideMasterReport(adminRoot);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as WorldwideMasterReport;
}

export function saveWorldwideMasterReport(adminRoot: string, report?: WorldwideMasterReport) {
  const filePath = worldwideMasterReportPath(adminRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const next = report || buildWorldwideMasterReport(adminRoot);
  next.updated_at = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
  return next;
}
