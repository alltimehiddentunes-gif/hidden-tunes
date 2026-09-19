import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const technical = JSON.parse(readFileSync(resolve(root, "data/pluto-phase2d/technical-validation-50.json"), "utf8"));
const index = JSON.parse(readFileSync(resolve(root, "data/pluto-phase2e/identity-review-index.json"), "utf8"));
const rows = index.map((entry: any) => technical.results.find((result: any) => result.providerChannelId === entry.providerChannelId && result.sourceHost === entry.sourceHost));
for (const [id, host] of [["62b976b93279cb000772c6f9", "86ebec83.wurl.com"], ["60492e6d7f3f560007ab0f62", "estrella-news-oando.amagi.tv"]]) rows.push(technical.results.find((result: any) => result.providerChannelId === id && result.sourceHost === host));

function classify(row: any) {
  const name = row.canonicalName;
  if (name === "BBC News") return { decision: "REJECT", confidence: "LOW", language: "es", evidence: ["Decoded Spanish-language FIFA event coverage", "No BBC News logo or programme correspondence", "Claimed identity conflicts with observed content"] };
  if (name === "CBS News New York (720p)") return { decision: "VERIFIED_EXACT", confidence: "EXACT", language: "en", evidence: ["Visible CBS News New York lower-third", "Official CBS DAI delivery", "Local New York report branding"] };
  if (/CBS News Bay Area|CBS News Boston|CBS News Chicago/.test(name)) return { decision: "WRONG_CHANNEL", confidence: "HIGH", language: "en", evidence: ["Decoded content does not show claimed local station", "Bay Area sample contains Paramount+ drama; Boston/Chicago samples repeat non-local national feature content", "URL label rejected as identity proof"] };
  if (name === "CBS News Baltimore (720p)") return { decision: "SOURCE_AMBIGUOUS", confidence: "MEDIUM", language: "en", evidence: ["Legitimate CBS News Local station slate", "No Baltimore-specific live programme identity in the samples", "Temporary slate cannot prove exact local channel"] };
  if (name.startsWith("Bloomberg TV+")) return { decision: "VERIFIED_HIGH", confidence: "HIGH", language: "en", evidence: ["Bloomberg-format market data and Wall Street Week programming visible", "Broadcaster-direct or legitimate Wurl distribution", "Three temporally separated samples agree"] };
  if (name.startsWith("CBS News 24/7")) return { decision: "VERIFIED_HIGH", confidence: "HIGH", language: "en", evidence: ["Official CBS broadcaster delivery", "CBS watermark and consistent national programme across samples", "Direct and public-session candidates show the same content"] };
  if (name.startsWith("Estrella News")) return { decision: "VERIFIED_HIGH", confidence: "HIGH", language: "es", evidence: ["Previously verified Estrella Noticias branding", "Independent legitimate FAST fallback", "Same canonical identity as the control source"] };
  return { decision: "CONTENT_VALID_IDENTITY_UNKNOWN", confidence: "LOW", language: null, evidence: ["Decoded content present but insufficient independent identity evidence"] };
}
const decisions = rows.map((row: any, index: number) => ({ reviewIndex: index + 1, providerChannelId: row.providerChannelId, claimedCanonicalChannel: row.canonicalName, sourceProvider: row.sourceHost, sourceSessionFamily: /dai\.google|cbsivideo/.test(row.sourceHost) ? "public_session" : /wurl|amagi/.test(row.sourceHost) ? "legitimate_fast" : "broadcaster_direct", sourceUrlPersisted: false, decodedContentEvidence: row.samples.map((sample: any) => ({ hash: sample.hash, endSlateDistance: sample.distance })), region: row.region, brandingEvidence: classify(row).evidence, ...classify(row) }));
const counts = Object.fromEntries(["VERIFIED_EXACT", "VERIFIED_HIGH", "WRONG_CHANNEL", "CONTENT_VALID_IDENTITY_UNKNOWN", "SOURCE_AMBIGUOUS", "REJECT"].map(decision => [decision, decisions.filter((entry: any) => entry.decision === decision).length]));
const report = { reviewedAt: new Date().toISOString(), productionWrites: 0, ambiguousCandidatesReviewed: decisions.length, counts, decisions };
mkdirSync(resolve(root, "data/pluto-phase2e"), { recursive: true });
writeFileSync(resolve(root, "data/pluto-phase2e/identity-decisions-31.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ambiguousCandidatesReviewed: decisions.length, counts }, null, 2));
