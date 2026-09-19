import { normalizeTeamName } from "./normalize";
export type FixtureCandidate = { id: string; startsAt: string; homeName: string; awayName: string; competitionName?: string | null };
export type ProviderIdentity = { startsAt: string; homeName: string; awayName: string; competitionName?: string | null };
export type Confidence = "EXACT" | "HIGH" | "MEDIUM" | "LOW" | "REJECT";

const GEO_WORDS = new Set(["ger", "germany", "bra", "brazil", "dutch", "netherlands", "france", "poland", "serbia", "switzerland", "romania", "colombia"]);
export function normalizeCompetitionName(value: string) {
  let words = normalizeTeamName(value).replace(/friendlies?/g, "friendly").split(" ").filter(Boolean).filter((word) => !GEO_WORDS.has(word));
  if (words.includes("friendly")) return "friendly";
  words = words.filter((word) => !["match", "clubs", "club"].includes(word));
  return words.sort().join(" ");
}

export function matchFixture(incoming: ProviderIdentity, fixtures: FixtureCandidate[]): { confidence: Confidence; fixtureId?: string; inverted?: boolean } {
  const start = Date.parse(incoming.startsAt), home = normalizeTeamName(incoming.homeName), away = normalizeTeamName(incoming.awayName);
  if (!home || !away || !Number.isFinite(start)) return { confidence: "REJECT" };
  const hits = fixtures.map((f) => ({ f, delta: Math.abs(Date.parse(f.startsAt) - start), fh: normalizeTeamName(f.homeName), fa: normalizeTeamName(f.awayName) })).filter((x) => Number.isFinite(x.delta) && x.delta <= 3 * 60 * 60_000 && ((x.fh === home && x.fa === away) || (x.fh === away && x.fa === home)));
  if (hits.length !== 1) return { confidence: hits.length > 1 ? "LOW" : "REJECT" };
  const hit = hits[0], inverted = hit.fh === away;
  if (inverted) return { confidence: "REJECT", fixtureId: hit.f.id, inverted: true };
  const providerCompetition = normalizeCompetitionName(incoming.competitionName || ""), fixtureCompetition = normalizeCompetitionName(hit.f.competitionName || "");
  const sameCompetition = Boolean(providerCompetition && providerCompetition === fixtureCompetition);
  if (hit.delta === 0 && sameCompetition) return { confidence: "EXACT", fixtureId: hit.f.id };
  if (hit.delta <= 60 * 60_000 && sameCompetition) return { confidence: "HIGH", fixtureId: hit.f.id };
  return { confidence: hit.delta <= 60 * 60_000 ? "MEDIUM" : "LOW", fixtureId: hit.f.id };
}
