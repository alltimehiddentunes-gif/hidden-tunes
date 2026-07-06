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
    limit?: number;
    offset?: number;
    all?: boolean;
    batchSize?: number;
    dryRun?: boolean;
    timeoutMs?: number;
  } = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--all") {
      options.all = true;
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
    if (arg === "--limit" && argv[i + 1]) {
      options.limit = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--batch-size" && argv[i + 1]) {
      options.batchSize = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--offset" && argv[i + 1]) {
      options.offset = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms" && argv[i + 1]) {
      options.timeoutMs = Number(argv[i + 1]);
      i += 1;
    }
  }

  return options;
}

loadEnvFile(path.join(adminRoot, ".env.local"));
loadEnvFile(path.join(adminRoot, ".env"));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { describeAudiobookSeedCatalog, ingestAudiobookSeedCatalog } =
    await import("../lib/audiobookSeedIngest");

  console.log(
    JSON.stringify(
      {
        phase: "catalog",
        catalog: describeAudiobookSeedCatalog(),
        options: args,
      },
      null,
      2
    )
  );

  const result = await ingestAudiobookSeedCatalog({
    categories: args.categories as never,
    limit: args.limit,
    offset: args.offset,
    all: args.all,
    batch_size: args.batchSize,
    dry_run: args.dryRun,
    timeout_ms: args.timeoutMs,
  });

  console.log(JSON.stringify({ phase: "result", result }, null, 2));

  if (result.books_failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
