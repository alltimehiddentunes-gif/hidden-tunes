import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPodcastBulkImport } from "../lib/podcastBulkImport";

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

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  const readValue = (flag: string) => {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    return argv[index + 1];
  };

  return {
    execute: args.has("--execute"),
    stage: Number(readValue("--stage") || "1") as 1 | 2 | 3 | 4,
    lang: readValue("--lang") || "en",
    query: readValue("--query") || undefined,
    catalog: (readValue("--catalog") || "general") as "general" | "mature",
    limit: readValue("--limit") ? Number(readValue("--limit")) : undefined,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const result = await runPodcastBulkImport({
    stage: args.stage,
    lang: args.lang,
    query: args.query,
    catalog: args.catalog,
    limit: args.limit,
    dry_run: !args.execute,
    auto_approve: true,
    max_episodes_per_feed: 40,
  });

  console.log(
    JSON.stringify(
      {
        ...result,
        note: args.execute
          ? "Executed staged import."
          : "Dry run only. Re-run with --execute to import.",
      },
      null,
      2
    )
  );

  if (!args.execute) {
    console.error(
      "Import blocked: staged imports require explicit --execute after audit approval."
    );
    process.exit(0);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
