import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Candidate = { sourceUrl: string };
type QueueItem = { identity: { providerChannelId: string; canonicalName: string }; candidates: Candidate[] };
const root = resolve(import.meta.dirname, "..");
const outPath = resolve(root, "data/pluto-phase2e/continuity.json");
const queue = JSON.parse(readFileSync(resolve(root, "data/pluto-phase2c/tier-a-50-recovery-queue.json"), "utf8")) as QueueItem[];
const tests = [
  { id: "62b976b93279cb000772c6f9", seconds: 3600, family: "broadcaster_direct", host: /bloomberg\.com$/i },
  { id: "5a6b92f6e22a617379789618", seconds: 3600, family: "public_session", host: /dai\.google\.com$/i },
  { id: "60492e6d7f3f560007ab0f62", seconds: 1800, family: "legitimate_fast", host: /estrellanews-glewed\.amagi\.tv$/i },
  { id: "61de8e502c8e9400077e5de7", seconds: 1800, family: "broadcaster_direct", host: /cdn-euronews\.akamaized\.net$/i },
  { id: "5dc9b875e280c80009a8a44a", seconds: 900, family: "public_session", host: /dai\.google\.com$/i },
  { id: "60fb299b79498900070b29e0", seconds: 900, family: "broadcaster_direct", host: /cbsnews\.com$/i },
  { id: "60cb6df2b2ad610008cd5bea", seconds: 900, family: "public_session", host: /cbsivideo\.com$/i },
  { id: "61de90a47365340007f77c27", seconds: 900, family: "broadcaster_direct", host: /cdn-euronews\.akamaized\.net$/i },
];

type Result = { id: string; name: string; family: string; targetSeconds: number; startedAt: string; finishedAt?: string; exitCode?: number | null; elapsedSeconds?: number; stalls: number; reconnectSignals: number; decoderErrors: number; audioErrors: number; expirySignals: number; redirectSignals: number; stderrTail?: string[]; passed?: boolean };
const results: Result[] = [];
function persist() {
  mkdirSync(resolve(root, "data/pluto-phase2e"), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ testedAt: new Date().toISOString(), productionWrites: 0, concurrency: tests.length, results }, null, 2));
}
async function run(test: typeof tests[number]) {
  const item = queue.find(entry => entry.identity.providerChannelId === test.id)!;
  const candidate = item.candidates.find(entry => test.host.test(new URL(entry.sourceUrl).hostname));
  if (!candidate) throw new Error(`Missing frozen candidate for ${item.identity.canonicalName}`);
  const result: Result = { id: test.id, name: item.identity.canonicalName, family: test.family, targetSeconds: test.seconds, startedAt: new Date().toISOString(), stalls: 0, reconnectSignals: 0, decoderErrors: 0, audioErrors: 0, expirySignals: 0, redirectSignals: 0 };
  results.push(result); persist();
  const started = Date.now(); const tail: string[] = [];
  await new Promise<void>(done => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "warning", "-rw_timeout", "15000000", "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5", "-i", candidate.sourceUrl, "-t", String(test.seconds), "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"]);
    child.stderr.setEncoding("utf8"); child.stderr.on("data", chunk => { for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) { tail.push(line); if (tail.length > 30) tail.shift(); if (/stall|buffer underflow/i.test(line)) result.stalls++; if (/reconnect|retry/i.test(line)) result.reconnectSignals++; if (/decode|invalid data|corrupt/i.test(line)) result.decoderErrors++; if (/audio.*error|error.*audio/i.test(line)) result.audioErrors++; if (/403|410|expired|forbidden/i.test(line)) result.expirySignals++; if (/redirect/i.test(line)) result.redirectSignals++; } persist(); });
    child.on("error", error => { tail.push(error.message); result.exitCode = -1; done(); });
    child.on("close", code => { result.exitCode = code; done(); });
  });
  result.finishedAt = new Date().toISOString(); result.elapsedSeconds = Math.round((Date.now() - started) / 1000); result.stderrTail = tail; result.passed = result.exitCode === 0 && result.elapsedSeconds >= test.seconds - 15 && result.decoderErrors === 0 && result.audioErrors === 0 && result.expirySignals === 0; persist();
}
async function main(){await Promise.all(tests.map(run));
const report = JSON.parse(readFileSync(outPath, "utf8")); report.completedAt = new Date().toISOString(); report.passCount = results.filter(result => result.passed).length; writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passCount: report.passCount, total: tests.length, outPath }, null, 2));
process.exitCode = report.passCount === tests.length ? 0 : 1;}
main().catch(error=>{console.error(error);process.exitCode=1})
