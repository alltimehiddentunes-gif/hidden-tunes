import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Candidate = { sourceUrl: string };
type QueueItem = { identity: { providerChannelId: string; canonicalName: string }; candidates: Candidate[] };
const root = resolve(import.meta.dirname, "..");
const queue = JSON.parse(readFileSync(resolve(root, "data/pluto-phase2c/tier-a-50-recovery-queue.json"), "utf8")) as QueueItem[];
const cases = [
  { id: "62b976b93279cb000772c6f9", hosts: [/bloomberg\.com$/i, /wurl\.com$/i] },
  { id: "5a6b92f6e22a617379789618", hosts: [/cbsnews\.com$/i, /dai\.google\.com$/i] },
  { id: "60492e6d7f3f560007ab0f62", hosts: [/estrellanews-glewed\.amagi\.tv$/i, /estrella-news-oando\.amagi\.tv$/i] },
];

function probe(url: string) {
  const run = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-rw_timeout", "12000000", "-i", url, "-t", "8", "-map", "0:v:0", "-f", "null", "-"], { encoding: "utf8", timeout: 20_000 });
  return { decoded: run.status === 0, exitCode: run.status, timedOut: Boolean(run.error && /timeout/i.test(run.error.message)), errorClass: run.status === 0 ? null : "transport_or_decode_failure" };
}

const results = cases.map(test => {
  const item = queue.find(entry => entry.identity.providerChannelId === test.id)!;
  const candidates = test.hosts.map(pattern => item.candidates.find(candidate => pattern.test(new URL(candidate.sourceUrl).hostname))!);
  const probes = candidates.map(candidate => probe(candidate.sourceUrl));
  const healthy = probes.map((value, index) => ({ rank: index + 1, health: value.decoded ? "VERIFIED_HEALTHY" : "TEMPORARILY_UNAVAILABLE" }));
  const initialSelection = healthy.find(entry => entry.health === "VERIFIED_HEALTHY")?.rank ?? null;
  const invalidated = healthy.map(entry => entry.rank === 1 ? { ...entry, health: "INVALIDATED" } : entry);
  const fallbackSelection = invalidated.find(entry => entry.health === "VERIFIED_HEALTHY")?.rank ?? null;
  return { id: test.id, name: item.identity.canonicalName, candidateCount: candidates.length, probes, initialSelection, simulatedPrimaryHealth: "INVALIDATED", fallbackSelection, fallbackPassed: initialSelection === 1 && fallbackSelection === 2 };
});
const report = { testedAt: new Date().toISOString(), pairCount: results.length, urlsPersisted: 0, results, passed: results.every(result => result.fallbackPassed) };
mkdirSync(resolve(root, "data/pluto-phase2d"), { recursive: true });
writeFileSync(resolve(root, "data/pluto-phase2d/fallback-proof.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
