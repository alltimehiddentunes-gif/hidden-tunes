import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function parseArgs(argv: string[]) {
  const options: {
    categories?: string[];
    maxFeeds?: number;
    maxEpisodesPerFeed?: number;
    dryRun?: boolean;
    autoApprove?: boolean;
  } = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--no-auto-approve") {
      options.autoApprove = false;
      continue;
    }
    if (arg === "--categories" && argv[i + 1]) {
      options.categories = argv[i + 1]
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
      i += 1;
      continue;
    }
    if (arg === "--max-feeds" && argv[i + 1]) {
      options.maxFeeds = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--max-episodes-per-feed" && argv[i + 1]) {
      options.maxEpisodesPerFeed = Number(argv[i + 1]);
      i += 1;
    }
  }

  return options;
}

loadEnvFile(path.join(adminRoot, ".env.local"));
loadEnvFile(path.join(adminRoot, ".env"));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { describePodcastSeedCatalog, ingestPodcastSeedCatalog } = await import(
    "../lib/podcastSeedIngest"
  );

  console.log(
    JSON.stringify(
      {
        phase: "catalog",
        catalog: describePodcastSeedCatalog(),
        options: args,
      },
      null,
      2
    )
  );

  const result = await ingestPodcastSeedCatalog({
    auto_approve: args.autoApprove !== false,
    categories: args.categories as never,
    max_feeds: args.maxFeeds,
    max_episodes_per_feed: args.maxEpisodesPerFeed,
    dry_run: args.dryRun === true,
  });

  console.log(JSON.stringify({ phase: "result", result }, null, 2));

  if (result.feeds_errored > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
