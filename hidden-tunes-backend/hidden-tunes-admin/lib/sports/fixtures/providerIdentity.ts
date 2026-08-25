/** Pure provider identity helpers used by bounded Sports fixture ingestion. */

export type SportsProviderIdentity = {
  fixtureId: string;
  competitionId: string;
  homeTeamId: string;
  awayTeamId: string;
};

function id(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function identity(
  fixtureId: unknown,
  competitionId: unknown,
  homeTeamId: unknown,
  awayTeamId: unknown
): SportsProviderIdentity | null {
  const normalized = {
    fixtureId: id(fixtureId),
    competitionId: id(competitionId),
    homeTeamId: id(homeTeamId),
    awayTeamId: id(awayTeamId),
  };
  return Object.values(normalized).every(Boolean)
    ? (normalized as SportsProviderIdentity)
    : null;
}

export function extractApiFootballIdentity(
  raw: Record<string, unknown>
): SportsProviderIdentity | null {
  const fixture = object(raw.fixture);
  const league = object(raw.league);
  const teams = object(raw.teams);
  return identity(
    fixture.id,
    league.id,
    object(teams.home).id,
    object(teams.away).id
  );
}

export function extractOpenLigaDbIdentity(
  raw: Record<string, unknown>
): SportsProviderIdentity | null {
  return identity(
    raw.matchID,
    raw.leagueId,
    object(raw.team1).teamId,
    object(raw.team2).teamId
  );
}

export function canonicalSportsTeamName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function sportsProviderFixtureKey(
  providerSlug: string,
  providerFixtureId: string
): string {
  return `${providerSlug.trim().toLowerCase()}:${providerFixtureId.trim()}`;
}

export function dedupeSportsProviderFixtures<
  T extends { providerSlug: string; providerFixtureId: string },
>(rows: T[]): T[] {
  const byIdentity = new Map<string, T>();
  for (const row of rows) {
    byIdentity.set(
      sportsProviderFixtureKey(row.providerSlug, row.providerFixtureId),
      row
    );
  }
  return [...byIdentity.values()];
}
