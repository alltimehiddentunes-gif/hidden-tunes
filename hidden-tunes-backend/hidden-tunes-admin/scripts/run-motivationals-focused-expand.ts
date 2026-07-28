/**
 * Focused high-yield Motivationals expansion loop.
 * Runs priority source families sequentially until public playable target is reached.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(adminRoot, ".env.local"));

function readOption(name: string, fallback: string) {
  const equalsPrefix = `${name}=`;
  const equalsArg = process.argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsArg) return equalsArg.slice(equalsPrefix.length) || fallback;
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

const PRIORITY_SOURCES = [
  // Non-LibriVox rich Archive pools first.
  "title-audio-motivation",
  "licensed-audio-selfdev",
  "licensed-audio-growth",
  "licensed-audio-speeches",
  "licensed-movies-selfdev",
  "opensource-audio-licensed",
  "community-audio-licensed",
  "opensource-audio",
  "public-domain-speeches",
  "opensource",
  "community-audio",
  "prelinger",
  // LibriVox backup only.
  "librivox-essays-history",
  "librivox-social-thought",
  "librivox-science-nature",
  "librivox-philosophy",
  "librivox-selfhelp",
];

async function getPublicCount() {
  const { getMotivationStatusSummary } = await import("../lib/motivationHealth");
  const summary = await getMotivationStatusSummary();
  return Number(summary.publicVerified || 0);
}

function runExpandOnce(source: string, target: number, batchSize: number, maxBatches: number) {
  return new Promise<{ code: number | null }>((resolve) => {
    const args = [
      "tsx",
      "scripts/run-motivationals-expand.ts",
      "--target",
      String(target),
      "--batch-size",
      String(batchSize),
      "--max-batches",
      String(maxBatches),
      "--concurrency",
      "8",
      "--promotion-size",
      String(Math.min(400, batchSize)),
      "--pause-ms",
      "400",
      "--resume",
      "--source",
      source,
      "--force-source",
    ];
    const child = spawn("npx", args, {
      cwd: adminRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      env: process.env,
    });

    const onChunk = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        if (
          line.includes('"phase":"batch_complete"') ||
          line.includes('"phase":"batch_error"') ||
          line.includes('"phase":"target_reached"') ||
          line.includes('"phase":"start"') ||
          line.includes('"type":"summary"')
        ) {
          // Keep compact progress lines only.
          try {
            const parsed = JSON.parse(line);
            console.error(
              JSON.stringify({
                focused_expand: true,
                source,
                phase: parsed.phase || parsed.type,
                batch: parsed.batch,
                pending_inserted: parsed.pending_inserted,
                promoted: parsed.promoted,
                public_playable_total: parsed.public_playable_total,
                remaining_to_target: parsed.remaining_to_target,
                error: parsed.error,
                message: parsed.message,
              })
            );
          } catch {
            console.error(line.slice(0, 400));
          }
        }
      }
    };

    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);
    child.on("close", (code) => resolve({ code }));
  });
}

async function main() {
  const target = Math.max(100, Number.parseInt(readOption("--target", "25000"), 10));
  const batchSize = Math.max(50, Number.parseInt(readOption("--batch-size", "200"), 10));
  const maxBatchesPerSource = Math.max(
    1,
    Number.parseInt(readOption("--max-batches-per-source", "40"), 10)
  );
  const rounds = Math.max(1, Number.parseInt(readOption("--rounds", "8"), 10));

  const startedAt = Date.now();
  let publicCount = await getPublicCount();
  console.error(
    JSON.stringify({
      focused_expand: true,
      phase: "start",
      target,
      public_playable: publicCount,
      remaining: Math.max(0, target - publicCount),
      sources: PRIORITY_SOURCES,
    })
  );

  for (let round = 0; round < rounds && publicCount < target; round += 1) {
    for (const source of PRIORITY_SOURCES) {
      publicCount = await getPublicCount();
      if (publicCount >= target) break;

      console.error(
        JSON.stringify({
          focused_expand: true,
          phase: "source_start",
          round: round + 1,
          source,
          public_playable: publicCount,
          remaining: Math.max(0, target - publicCount),
        })
      );

      const result = await runExpandOnce(source, target, batchSize, maxBatchesPerSource);
      publicCount = await getPublicCount();

      console.error(
        JSON.stringify({
          focused_expand: true,
          phase: "source_done",
          round: round + 1,
          source,
          exit_code: result.code,
          public_playable: publicCount,
          remaining: Math.max(0, target - publicCount),
        })
      );

      if (publicCount >= target) break;
    }
  }

  publicCount = await getPublicCount();
  const payload = {
    ok: true,
    target,
    public_playable: publicCount,
    remaining_to_target: Math.max(0, target - publicCount),
    target_reached: publicCount >= target,
    elapsed_ms: Date.now() - startedAt,
  };
  fs.mkdirSync(path.join(adminRoot, "data"), { recursive: true });
  fs.writeFileSync(
    path.join(adminRoot, "data", "motivationals-focused-expand-report.json"),
    JSON.stringify(payload, null, 2)
  );
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
