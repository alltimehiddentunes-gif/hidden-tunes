import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPodcastExpansionImport } from "../lib/podcastExpansionImport";

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
loadEnvFile(path.join(adminRoot, ".env"));

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  const readValue = (flag: string) => {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    return argv[index + 1];
  };

  return {
    execute: args.has("--execute"),
    resume: args.has("--resume"),
    limit: Number(readValue("--limit") || "100"),
    batch: Number(readValue("--batch") || "1"),
    subBatch: readValue("--sub-batch") ? Number(readValue("--sub-batch")) : undefined,
    staticFeeds: args.has("--static-feeds"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.execute && args.batch >= 4) {
    const { isPriorBatchValidated } = await import("../lib/podcastExpansionCheckpoint");
    const prior = args.batch - 1;
    const maxWaitMs = 3_600_000;
    const pollMs = 15_000;
    const started = Date.now();
    console.error(`Waiting for batch ${prior} validation before starting batch ${args.batch}...`);
    while (Date.now() - started < maxWaitMs) {
      if (isPriorBatchValidated(args.batch, adminRoot)) break;
      const validatedPath = path.join(
        adminRoot,
        "data",
        `podcast-expansion-batch${prior}-validated.json`
      );
      if (fs.existsSync(validatedPath)) {
        const payload = JSON.parse(fs.readFileSync(validatedPath, "utf8")) as { pass?: boolean };
        if (payload.pass === false) {
          throw new Error(`Batch ${prior} validation failed. Cannot start batch ${args.batch}.`);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    if (!isPriorBatchValidated(args.batch, adminRoot)) {
      throw new Error(`Timed out waiting for batch ${prior} validation.`);
    }
    console.error(`Batch ${prior} validated. Proceeding with batch ${args.batch}.`);
  }

  const result = await runPodcastExpansionImport({
    limit: args.limit,
    dry_run: !args.execute,
    discover: !args.staticFeeds,
    max_episodes_per_feed: 40,
    feed_timeout_ms: 20_000,
    batch: args.batch,
    sub_batch: args.subBatch,
    resume: args.resume,
  });

  const output = {
    batch: args.batch,
    sub_batch: args.subBatch || null,
    discovery_method: args.staticFeeds ? "static_feed_list" : "itunes_search_api",
    ...result,
  };

  const suffix = args.subBatch ? `-sub${args.subBatch}` : "";
  const outPath = path.join(
    adminRoot,
    "data",
    `podcast-expansion-batch${args.batch}${suffix}-result.json`
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(output, null, 2));
  console.error(`Wrote ${outPath}`);

  if (!args.execute) {
    console.error("Dry run only. Re-run with --execute to import.");
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
