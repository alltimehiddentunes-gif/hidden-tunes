import fs from "node:fs";
import path from "node:path";

import {
  AFRICA_RADIO_QUEUE,
  type AfricanCountry,
} from "@/lib/radioAfricaExpansion/africanCountries";

export type AfricaCountryDiscoveryStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked";

export type AfricaCountryQueueEntry = {
  country: string;
  code: string;
  discovery_status: AfricaCountryDiscoveryStatus;
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

export type AfricaRadioQueueState = {
  version: 1;
  created_at: string;
  updated_at: string;
  current_country_code: string | null;
  countries: AfricaCountryQueueEntry[];
};

function defaultEntry(country: AfricanCountry): AfricaCountryQueueEntry {
  return {
    country: country.name,
    code: country.code,
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
    notes: [],
  };
}

export function africaQueuePath(adminRoot: string) {
  return path.join(adminRoot, "data", "radio-africa-expansion-queue.json");
}

export function loadAfricaRadioQueue(adminRoot: string): AfricaRadioQueueState {
  const filePath = africaQueuePath(adminRoot);
  if (!fs.existsSync(filePath)) {
    const now = new Date().toISOString();
    return {
      version: 1,
      created_at: now,
      updated_at: now,
      current_country_code: null,
      countries: AFRICA_RADIO_QUEUE.map(defaultEntry),
    };
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as AfricaRadioQueueState;
  const byCode = new Map(parsed.countries.map((c) => [c.code.toUpperCase(), c]));
  // Ensure every African country remains present even if queue file is older.
  const countries = AFRICA_RADIO_QUEUE.map((country) => {
    const existing = byCode.get(country.code);
    return existing ? { ...defaultEntry(country), ...existing, country: country.name, code: country.code } : defaultEntry(country);
  });
  return {
    version: 1,
    created_at: parsed.created_at || new Date().toISOString(),
    updated_at: parsed.updated_at || new Date().toISOString(),
    current_country_code: parsed.current_country_code || null,
    countries,
  };
}

export function saveAfricaRadioQueue(adminRoot: string, state: AfricaRadioQueueState) {
  const filePath = africaQueuePath(adminRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  state.updated_at = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

export function getQueueEntry(
  state: AfricaRadioQueueState,
  code: string
): AfricaCountryQueueEntry | undefined {
  return state.countries.find((c) => c.code.toUpperCase() === code.toUpperCase());
}
