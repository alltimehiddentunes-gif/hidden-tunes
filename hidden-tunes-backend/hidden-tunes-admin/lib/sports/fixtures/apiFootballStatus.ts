/** API-Football short-code mapping into the existing Sports lifecycle. */

export type ApiFootballLifecycle =
  | "scheduled"
  | "live"
  | "halftime"
  | "extra_time"
  | "penalties"
  | "finished"
  | "postponed"
  | "cancelled"
  | "abandoned"
  | "suspended"
  | "delayed"
  | "unknown";

export type ApiFootballStatusMapping = {
  code: string;
  lifecycle: ApiFootballLifecycle;
  /** Persisted sports_fixtures.status; constrained by the existing schema. */
  fixtureStatus: "scheduled" | "live" | "completed" | "postponed" | "cancelled";
  publicStatus:
    | "scheduled"
    | "live"
    | "half_time"
    | "extra_time"
    | "penalties"
    | "delayed"
    | "postponed"
    | "cancelled"
    | "finished"
    | "unavailable";
  live: boolean;
  terminal: boolean;
  known: boolean;
};

const MAP: Record<
  string,
  Omit<ApiFootballStatusMapping, "code" | "known">
> = {
  TBD: lifecycle("scheduled", "scheduled", "scheduled"),
  NS: lifecycle("scheduled", "scheduled", "scheduled"),
  "1H": lifecycle("live", "live", "live", true),
  HT: lifecycle("halftime", "live", "half_time", true),
  "2H": lifecycle("live", "live", "live", true),
  ET: lifecycle("extra_time", "live", "extra_time", true),
  BT: lifecycle("extra_time", "live", "extra_time", true),
  P: lifecycle("penalties", "live", "penalties", true),
  LIVE: lifecycle("live", "live", "live", true),
  SUSP: lifecycle("suspended", "postponed", "unavailable"),
  INT: lifecycle("delayed", "postponed", "delayed"),
  FT: lifecycle("finished", "completed", "finished", false, true),
  AET: lifecycle("finished", "completed", "finished", false, true),
  PEN: lifecycle("finished", "completed", "finished", false, true),
  PST: lifecycle("postponed", "postponed", "postponed"),
  CANC: lifecycle("cancelled", "cancelled", "cancelled", false, true),
  ABD: lifecycle("abandoned", "cancelled", "unavailable", false, true),
  AWD: lifecycle("finished", "completed", "finished", false, true),
  WO: lifecycle("finished", "completed", "finished", false, true),
};

function lifecycle(
  value: ApiFootballLifecycle,
  fixtureStatus: ApiFootballStatusMapping["fixtureStatus"],
  publicStatus: ApiFootballStatusMapping["publicStatus"],
  live = false,
  terminal = false
): Omit<ApiFootballStatusMapping, "code" | "known"> {
  return { lifecycle: value, fixtureStatus, publicStatus, live, terminal };
}

export function mapApiFootballStatus(
  rawCode?: string | null
): ApiFootballStatusMapping {
  const code = String(rawCode || "").trim().toUpperCase();
  const mapped = MAP[code];
  if (mapped) return { code, ...mapped, known: true };
  return {
    code: code || "UNKNOWN",
    lifecycle: "unknown",
    fixtureStatus: "scheduled",
    publicStatus: "unavailable",
    live: false,
    terminal: false,
    known: false,
  };
}
